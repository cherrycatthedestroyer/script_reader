export function actorCue(cues, currentIndex, character) {
  if (!character) return { kind: 'unselected' };
  const index = cues.findIndex((cue, i) => i >= currentIndex && cue.speaker === character);
  if (index < 0) return { kind: 'complete' };
  return { kind: index === currentIndex ? 'now' : 'upcoming', cue: cues[index], index, distance: index - currentIndex };
}

export function nextIndex(current, command, count) {
  if (command.action === 'next') return Math.min(count - 1, current + 1);
  if (command.action === 'previous') return Math.max(0, current - 1);
  if (command.action === 'jump' && Number.isInteger(command.index) && command.index >= 0 && command.index < count) return command.index;
  throw new Error('Invalid cue command');
}
