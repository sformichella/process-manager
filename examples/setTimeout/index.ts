import { spawn } from 'child_process'

import { commandWithArgs, viewProcessesInTabs } from '../../index'



function run() {
  const commands: commandWithArgs[] = [
    ['npx', ['ts-node', './processes/process1.ts']],
    ['npx', ['ts-node', './processes/process2.ts']],
    ['npx', ['ts-node', './processes/process3.ts']]
  ]

  viewProcessesInTabs(...commands)
}

// Main
run()