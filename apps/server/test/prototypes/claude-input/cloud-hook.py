# Throwaway native Claude hook. No bootstrap credential leaves this process.
import hashlib, hmac, json, os, pathlib, re, sys, urllib.request

config = json.loads(pathlib.Path(__file__).with_name('cloud-config.json').read_text())
key = os.environ['CURSOR_CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN'].encode()
token = hmac.new(key, ('haus-input-prototype:' + config['jobId']).encode(), hashlib.sha256).hexdigest()
data = json.load(sys.stdin)
session = data['session_id']
state_path = pathlib.Path('/tmp') / ('haus-input-' + session + '.json')
state = json.loads(state_path.read_text()) if state_path.exists() else {}

def call(path, body=None):
    req = urllib.request.Request(config['url'] + path, data=None if body is None else json.dumps(body).encode(), headers={'X-Haus-Cloud-Run': token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

def save():
    state_path.write_text(json.dumps(state))

event = data['hook_event_name']
if event == 'UserPromptSubmit':
    match = re.search(r'HAUS_RESUME=(input_[a-f0-9]{24})', data.get('prompt', ''))
    if match:
        request = call('/request?id=' + match[1] + '&session=' + session)
        if request['state'] != 'answered':
            raise RuntimeError('Resume has no outstanding answer')
        state.update(request=request, resume=True)
        save()
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'additionalContext': 'Reissue AskUserQuestion with exactly these original questions, then continue the task. Stored answer is supplied by the native hook: ' + json.dumps(request['questions'])}}))
    call('/event', {'event': event, 'sessionId': session, 'promptId': data['prompt_id'], 'resume': bool(match)})
elif event == 'PreToolUse':
    if state.get('resume'):
        request = call('/request?id=' + state['request']['id'] + '&session=' + session)
        if request['state'] != 'answered':
            raise RuntimeError('Stale resume')
        state.update(resumedPromptId=data['prompt_id'], resumedToolUseId=data['tool_use_id'])
        save()
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'allow', 'updatedInput': {'questions': request['questions'], 'answers': request['answer']}}}))
    else:
        request = call('/question', {'sessionId': session, 'promptId': data['prompt_id'], 'toolUseId': data['tool_use_id'], 'questions': data['tool_input']['questions']})
        state.update(request=request, resume=False)
        save()
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'deny', 'permissionDecisionReason': 'Haus input request ' + request['id'] + ' is durably pending. End this turn now. Do not retry, infer an answer, or proceed. Await a HAUS_RESUME continuation.'}}))
elif event == 'PostToolUse' and state.get('resume'):
    # Receipt is emitted only after the native AskUserQuestion tool completed.
    if data['tool_use_id'] != state.get('resumedToolUseId'):
        raise RuntimeError('Wrong consumed tool')
    call('/consumed', {'id': state['request']['id'], 'sessionId': session, 'promptId': data['prompt_id'], 'toolUseId': data['tool_use_id'], 'answer': data['tool_input']['answers']})
    state['resume'] = False
    state['consumed'] = True
    save()
elif event == 'Stop':
    call('/event', {'event': event, 'sessionId': session, 'promptId': data['prompt_id'], 'pending': bool(state.get('request') and not state.get('consumed')), 'message': data.get('last_assistant_message'), 'backgroundTasks': data.get('background_tasks')})
