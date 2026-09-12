export type ChapterId = 'her' | 'moments' | 'ahead' | 'light' | 'you'

export const gift = {
  firstName: 'Saleemarh',
  lastName: 'Uleymaryn',
  fullName: 'Saleemarh Uleymaryn',
  whisper: 'a little something, just for you',
  aside: ['A little something,', 'just for you.'] as const,
  begin: 'Begin',
  chapters: [
    { id: 'her' as const, label: 'Her' },
    { id: 'moments' as const, label: 'Moments' },
    { id: 'ahead' as const, label: 'Ahead' },
    { id: 'light' as const, label: 'Light' },
    { id: 'you' as const, label: 'For you' },
  ],
  story: [
    'She has a way of making ordinary moments look different.',
    "Some people don't need to be loud to be noticed.",
    "There's a kind of light that just stays with you.",
    'This year looks good on her already.',
  ],
  momentsLead: 'The little worlds she leaves behind.',
  ahead: {
    line: '',
    hold: 'Hold',
    held: 'There you go',
  },
  birthday: {
    hello: 'Happy Birthday,',
    name: 'Saleemarh.',
    wish: 'Happy Birthday, Saleemarh.',
    close: 'Keep becoming.',
  },
  sign: 'Datti',
  photoNotes: ['Her', 'This light', 'This smile', 'This day', 'This feeling', 'This year'],
  whispers: {
    '02': { lead: '', line: '', place: 'none' },
    '03': { lead: 'In her', line: 'own time.', place: 'grass' },
    '03.1': { lead: '', line: '', place: 'none' },
    '04': { lead: 'There', line: 'she is.', place: 'shadow' },
    '05': { lead: 'Keep', line: 'up.', place: 'path' },
    '06': { lead: '', line: '', place: 'none' },
  } as const,
} as const
