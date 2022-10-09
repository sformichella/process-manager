export const keys = {
  SIGINT: Buffer.from('03', 'hex'),
  left: Buffer.from('1b5b44', 'hex'),
  right: Buffer.from('1b5b43', 'hex'),
  k: Buffer.from('6b', 'hex'),
}

export function enableMouseEvents() {
  process.stdout.write('\x1b[?1005h');
  process.stdout.write('\x1b[?1003h');
  return disableMouseEvents
}

function disableMouseEvents() {
  process.stdout.write('\x1b[?1005l');
  process.stdout.write('\x1b[?1003l');
}

export function isScrollEvent(data: Buffer) {
  const matchMouseEvent = /^\u001b\[M/
  const event = data.toString('utf-8')
  if(!matchMouseEvent.test(event)) return null
  if((event.charCodeAt(3) & 96) !== 96) return null
  return event.charCodeAt(3) & 1 ? -1 : 1
}

