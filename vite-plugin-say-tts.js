import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_TEXT = 300
/** Voice names are macOS identifiers — letters, digits, spaces, parens, hyphens. */
const VOICE_PATTERN = /^[\w ()'-]{1,64}$/

/**
 * Renders announcer lines to WAV with the macOS `say` command.
 *
 * This exists so the voice can enter the Web Audio graph. SpeechSynthesis plays
 * straight out of the system and exposes no AudioNode, so it can never be given
 * reverb; a decoded WAV can. Dev-server only — `configureServer` does not run in
 * a production build, and the client falls back to SpeechSynthesis (dry) when
 * the endpoint is absent.
 */
export function sayTts() {
  return {
    name: 'say-tts',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const text = (url.searchParams.get('text') || '').slice(0, MAX_TEXT)
        const voice = url.searchParams.get('voice') || ''
        const wpm = Number(url.searchParams.get('wpm')) || 175

        if (process.platform !== 'darwin') {
          res.statusCode = 501
          return res.end('say is macOS only')
        }
        if (!text.trim()) {
          res.statusCode = 400
          return res.end('missing text')
        }
        if (voice && !VOICE_PATTERN.test(voice)) {
          res.statusCode = 400
          return res.end('bad voice')
        }

        const file = join(tmpdir(), `boxing-tts-${randomUUID()}.wav`)
        // execFile with an argument array — never a shell string, so the text
        // cannot escape into a command.
        const args = ['-o', file, '--data-format=LEI16@22050', '-r', String(Math.round(wpm))]
        if (voice) args.push('-v', voice)
        args.push('--', text)

        try {
          await new Promise((resolve, reject) => {
            execFile('/usr/bin/say', args, { timeout: 10_000 }, (err) =>
              err ? reject(err) : resolve()
            )
          })
          const wav = await readFile(file)
          res.setHeader('Content-Type', 'audio/wav')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(wav)
        } catch (err) {
          res.statusCode = 500
          res.end(String(err?.message ?? err))
        } finally {
          rm(file, { force: true }).catch(() => {})
        }
      })
    },
  }
}
