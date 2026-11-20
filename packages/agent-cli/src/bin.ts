#!/usr/bin/env bun
import { runAgentCli } from './agent-cli.ts';

process.exitCode = await runAgentCli(process.argv.slice(2));
