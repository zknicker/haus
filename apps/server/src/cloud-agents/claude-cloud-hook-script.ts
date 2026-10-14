/** Installed only in the provider VM; credentials arrive through its Network Secret proxy. */
export const claudeCloudHookScript = `#!/usr/bin/env python3
import json, os, pathlib, re, subprocess, sys, time, urllib.request

ROOT = pathlib.Path('/opt/haus-cloud')

def atomic_json(path, value, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode), 'w') as stream:
        json.dump(value, stream)
    os.replace(temporary, path)

def install(origin):
    ROOT.mkdir(parents=True, exist_ok=True)
    target = ROOT / 'hook.py'
    if pathlib.Path(__file__).resolve() != target.resolve():
        target.write_bytes(pathlib.Path(__file__).read_bytes())
        target.chmod(0o755)
    atomic_json(ROOT / 'config.json', {'origin': origin.rstrip('/')}, 0o644)
    settings = pathlib.Path('/etc/claude-code/managed-settings.json')
    current = json.loads(settings.read_text()) if settings.exists() else {}
    hooks = current.setdefault('hooks', {})
    command = 'python3 /opt/haus-cloud/hook.py'
    for event in ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'StopFailure']:
        groups = hooks.setdefault(event, [])
        groups[:] = [group for group in groups if not any(hook.get('command') == command for hook in group.get('hooks', []))]
        group = {'hooks': [{'type': 'command', 'command': command, 'timeout': 30, 'onFailure': 'block'}]}
        if event in ['PreToolUse', 'PostToolUse']:
            group['matcher'] = 'AskUserQuestion'
        groups.append(group)
    atomic_json(settings, current, 0o644)

if len(sys.argv) == 3 and sys.argv[1] == 'install':
    install(sys.argv[2])
    sys.exit(0)

data = json.load(sys.stdin)
config = json.loads((ROOT / 'config.json').read_text())
origin = config['origin']
session = data['session_id']
if not re.fullmatch(r'[A-Za-z0-9-]+', session):
    raise RuntimeError('Invalid runtime session identity')
state_root = pathlib.Path('/tmp/haus-cloud-native')
state_root.mkdir(mode=0o700, exist_ok=True)
os.chmod(state_root, 0o700)
state_path = state_root / (session + '.json')
state = json.loads(state_path.read_text()) if state_path.exists() else {}

def save():
    atomic_json(state_path, state)

def call(path, body=None, authenticated=True):
    headers = {'Content-Type': 'application/json'}
    if authenticated:
        headers['X-Haus-Cloud-Run'] = state['token']
    request = urllib.request.Request(origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)

def callback(body):
    body.update(sessionId=session, promptId=data['prompt_id'])
    return call('/api/cloud-agents/callback', body)

event = data['hook_event_name']
if event == 'UserPromptSubmit':
    prompt = data.get('prompt', '')
    if 'HAUS_CLOUD_VERIFY' in prompt:
        version = subprocess.run(['claude', '--version'], capture_output=True, text=True, timeout=5, check=True).stdout.strip()
        call('/api/cloud-agents/bootstrap/verify', {'sessionId': session, 'promptId': data['prompt_id'], 'protocolVersion': 1, 'remoteVersion': version}, False)
        sys.exit(0)
    match = re.search(r'HAUS_CLOUD_RUN=(caw_[A-Za-z0-9_-]{16})/(car_[A-Za-z0-9_-]{16})', prompt)
    continuation = re.search(r'HAUS_CLOUD_INPUT=(cai_[A-Za-z0-9_-]{16})', prompt)
    if not match and not continuation:
        state = {}
        save()
        sys.exit(0)
    if match:
        state = {'workId': match[1], 'runId': match[2]}
    if not state.get('runId'):
        sys.exit(0)
    body = {'workId': state['workId'], 'runId': state['runId'], 'sessionId': session, 'promptId': data['prompt_id']}
    if continuation:
        body['requestId'] = continuation[1]
    leased = call('/api/cloud-agents/bootstrap', body, False)
    state['token'] = leased['token']
    state['promptId'] = data['prompt_id']
    state.pop('allowed', None)
    save()
    request = leased.get('request')
    if request:
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'additionalContext': 'Reissue AskUserQuestion with exactly these original questions; its native hook supplies the saved answer. Then continue the original task: ' + json.dumps(request['questions'])}}))
elif state.get('token') and event == 'PreToolUse':
    request = callback({'kind': 'question', 'toolUseId': data['tool_use_id'], 'questions': data['tool_input']['questions']})['request']
    deadline = time.monotonic() + 5
    while request['state'] == 'pending' and time.monotonic() < deadline:
        time.sleep(0.4)
        request = call('/api/cloud-agents/input/' + request['id'])['request']
    if request['state'] == 'answered':
        state['allowed'] = {'id': request['id'], 'toolUseId': data['tool_use_id'], 'answer': request['answer']}
        save()
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'allow', 'updatedInput': {'questions': request['questions'], 'answers': request['answer']}}}))
    else:
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'deny', 'permissionDecisionReason': 'Haus input request ' + request['id'] + ' is durably pending. End this turn now; do not retry or infer the answer. Await the explicit Haus continuation.'}}))
elif state.get('token') and event == 'PostToolUse':
    allowed = state.get('allowed')
    if not allowed or allowed['toolUseId'] != data['tool_use_id'] or allowed['answer'] != data['tool_input'].get('answers'):
        raise RuntimeError('Native question did not consume its stored Haus answer')
    callback({'kind': 'consume', 'id': allowed['id'], 'toolUseId': data['tool_use_id'], 'answer': data['tool_input']['answers']})
    state.pop('allowed', None)
    save()
elif state.get('token') and event == 'Stop':
    tasks = data.get('background_tasks')
    crons = data.get('session_crons')
    if not isinstance(tasks, list) or not isinstance(crons, list):
        sys.exit(0)
    count = len(tasks) + len(crons)
    callback({'kind': 'stop', 'backgroundTasks': count, 'sessionCrons': len(crons), 'lastAssistantMessage': data.get('last_assistant_message', '')[:2000]})
elif state.get('token') and event == 'StopFailure':
    callback({'kind': 'failure', 'message': str(data.get('error', 'Native Claude execution failed'))[:2000]})
`;
