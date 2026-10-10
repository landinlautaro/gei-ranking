import type { Match, RankingRow } from '../api/types'
import { formatDate } from './format'

/** WhatsApp bold is *text*; the messages stay plain text so they paste the same everywhere. */

/** What a message needs from a match: satisfied by both the public and the admin match. */
export type MessageMatch = Pick<Match, 'challenger' | 'challenged' | 'winner' | 'result' | 'completion' | 'movementText'>

function resultSentence(m: MessageMatch): string {
  const loser = m.winner.id === m.challenger.id ? m.challenged : m.challenger
  const how = m.completion === 'Walkover' ? 'por W.O.' : m.result
  return `${m.winner.fullName} le ganó a ${loser.fullName} ${how}`
}

/** One finished match, ready to paste in the group right after loading it. */
export function matchMessage(m: MessageMatch): string {
  const lines = ['🎾 *Resultado*', resultSentence(m)]
  if (m.movementText) lines.push(m.movementText)
  return lines.join('\n')
}

interface RankingMessageInput {
  rows: RankingRow[]
  /** Matches to report, in any order (they are listed oldest first). */
  matches: Match[]
  /** ISO instant the ranking is published; shown as the club-local date. */
  publishedAt: string
  /** ISO instant the results start from. */
  since: string
  siteUrl: string
}

/** The Monday post: current ranking, then the results since the last one. */
export function rankingMessage({ rows, matches, publishedAt, since, siteUrl }: RankingMessageInput): string {
  const lines = [`🎾 *Ranking GEI* — ${formatDate(publishedAt)}`, '']
  for (const r of rows) lines.push(`${r.position}. ${r.player.fullName}`)

  if (matches.length > 0) {
    const chronological = [...matches].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id - b.id)
    lines.push('', `*Resultados desde el ${formatDate(since)}*`)
    for (const m of chronological) {
      lines.push(`• ${resultSentence(m)}${m.movementText ? ` (${m.movementText})` : ''}`)
    }
  }

  lines.push('', `Ver todo: ${siteUrl}`)
  return lines.join('\n')
}
