// Sample books baked into the standalone single-file build (as data: URLs).
import pride from '../../public/samples/pride-and-prejudice.epub?url'
import frankenstein from '../../public/samples/frankenstein.epub?url'
import sherlock from '../../public/samples/sherlock-holmes-sample.txt?url'
import letters from '../../public/samples/frankenstein-letters.pdf?url'

export const EMBEDDED_SAMPLES: [string, string][] = [
  ['pride-and-prejudice.epub', pride], ['frankenstein.epub', frankenstein],
  ['sherlock-holmes-sample.txt', sherlock], ['frankenstein-letters.pdf', letters],
]
