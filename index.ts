import { spawn, ChildProcess, SpawnOptionsWithoutStdio } from 'child_process'

import { keys, enableMouseEvents, isScrollEvent } from './utils'

/**
 * One of the overloads of {@link spawn NodeJS's spawn}. Inference
 * can't match the overload I'm using, so define it explicitly here.
 * 
 * See this {@link https://stackoverflow.com/questions/68799234/typescript-pick-only-specific-method-from-overload-to-be-passed-to-parameters stackoverflow post}.
 */
export type commandWithArgs = [
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithoutStdio
]

// Workflow

// Configure Main
// Init state
// 

export function viewProcessesInTabs(...commands: commandWithArgs[]) {
  // configure main
  process.stdin.setRawMode(true)

  const disableMouseEvents = enableMouseEvents()

  process.on('beforeExit', () => {
    disableMouseEvents()
  })
  
  // initialize state
  const state = initialState()
  const dimensions = [25, 20]
  const main = trackMainHistory(state)

  state.processes = commands.map((cmd) => spawn(...cmd))
  state.histories = [main.history].concat(state.processes.map((p) => trackHistory(p, 1000)))
  state.lines = dimensions[1]

  // configure events
  process.stdin.on('data', (data) => terminateHandler(data, state, main))
  process.stdin.on('data', (data) => arrowHandler(data, state))
  process.stdin.on('data', (data) => scrollHandler(data, state))
  updateActiveTab(state)

  // final setup
  main.print('Initialized!\n')

  render(state)
}

function initialState() {
  const processes: ChildProcess[] = []
  const histories: any[][] = []

  return {
    tab: 0,
    lines: 1,
    processes,
    histories,
    cursor: 0
  }
}

type state = ReturnType<typeof initialState>

/**
 * Render lines to {@link NodeJS.Process.stdout | stdout} according to the current state.
 * 
 * @param state 
 */
function render(state: state) {
  const { tab, lines, histories, cursor } = state

  const tabs = histories
    .map((_, index) => {
      let selected = '[ ]'
      if(index === tab) selected = '[*]'
      if(index === 0)  return `main ${selected} `
      return ` process ${index} ${selected} `
    })
    .join('|')

  const header = [
    'Use the left and right arrow keys to navigate between processes\n',
    '\n',
    tabs + '\n',
    '\n'
  ]

  const current = histories[tab]

  const endLineIndex = Math.min(cursor + lines, current.length)

  const view = [
    ...header,
    ...histories[tab].slice(cursor, endLineIndex)
  ]

  console.clear()

  view.forEach((line) => process.stdout.write(line))
}

/**
 * Update view if the selected process writes to its stdout
 * 
 * @privateRemarks Possibly add something that adds/removes this listener on tab change
 * 
 * @param state 
 */
function updateActiveTab(state: state) {
  state.processes.forEach((p, i) => {
    p.stdout?.on('data', () => {
      const { tab, lines, histories, cursor } = state

      let active = true

      if(i + 1 === tab) {
        const maxCursor = Math.max(0, histories[i + 1].length - lines)

        if(cursor > maxCursor - 2) {
          state.cursor = maxCursor
          active = true
        }

        else {
          active = false
        }

        if(active) render(state)
      }
    })
  })
}

/**
 * Since the view is controlled by {@link render},
 * we cannot directly write to stdout without 
 * messing up the view. Instead, use the returned
 * print method to write to the main stdout
 * 
 * @param state 
 * 
 */
function trackMainHistory(state: state) {
  const history: any[] = []

  function print(data: string | Buffer) {
    history.push(data)
    render(state)
  }

  return { history, print }
}

/**
 * Store up to {@link retention} number of lines
 * of the stdout of {@link process} in memory
 * 
 * @param process Child process to listen on
 * @param retention The number of lines to be stored in memory
 */
function trackHistory(process: ChildProcess, retention: number = 1) {
  let history: any[] = []

  process.stdout?.on('data', (data) => {
    history.push(data)
    if(history.length > retention) {
      history.splice(0, history.length - retention)
    }
  })

  return history
}

/**
 * Respond to SIGINT input.
 * 
 * Emits `beforeExit` event to main process. Sends `SIGTERM`
 * to child processes via {@link ChildProcess.kill}
 * 
 * @param data
 * @param state
 * @param main
 */
function terminateHandler(data: Buffer, state: state, main: ReturnType<typeof trackMainHistory>) {
  if(data.equals(keys.SIGINT)) {
    const { tab, histories, processes } = state

    if(tab === 0) {
      const exitCode = process.exitCode || 0
      process.emit('beforeExit', exitCode)
      processes.forEach(p => p.kill())
      process.exit(exitCode)
    }

    if(tab > 0) {
      const current = processes[tab - 1]
      const currentHistory = histories[tab]

      current.on('exit', () => {
        main.print(`Process '${tab}' exited\n`)
        currentHistory.push('\n', `Press 'K' to restart process '${tab}'\n`)

        process.stdin.on('data', (data) => restartHandler(data, state))

        if(state.tab === tab) render(state)
      })

      currentHistory.push('\n', `Received SIGINT\n`)

      render(state)

      current.kill('SIGINT')
    }
  }
}

function restartHandler(data: Buffer, state: state) {
  if(data.equals(keys.k)) {
    
  }
}

/**
 * Updates the {@link state} `tab` according to which
 * arrow key was pressed. Resets `cursor` to the maximum
 * (most recent) value, then re-renders the view.
 * 
 * @param data 
 * @param state 
 */
function arrowHandler(data: Buffer, state: state) {
  const { tab, histories, lines } = state

  if(data.equals(keys.left)) {
    state.tab = (tab + histories.length - 1) % (histories.length)
    const current = histories[tab]
    const maxCursor = Math.max(0, current.length - lines)
    state.cursor = maxCursor
  }

  if(data.equals(keys.right)) {
    state.tab = (tab + 1) % (histories.length)
    const current = state.histories[state.tab]
    const maxCursor = Math.max(0, current.length - lines)
    state.cursor = maxCursor
  }

  render(state)
}

/**
 * Updates the {@link state} `cursor` according to the
 * scroll direction. Re-renders the view if the `cursor`
 * changed.
 * 
 * @param data 
 * @param state 
 */
function scrollHandler(data: Buffer, state: state) {
  const { tab, histories, cursor, lines } = state

  const direction = isScrollEvent(data)

  if(direction !== null) {
    const current = histories[tab]

    if(direction === -1) {
      state.cursor = Math.max(0, cursor - 1)
    }

    if(direction === 1) {
      const maxCursor = Math.max(0, current.length - lines)
      state.cursor = Math.min(maxCursor, cursor + 1)
    }
    
    if(state.cursor !== cursor) render(state)
  }
}

