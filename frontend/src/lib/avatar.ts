import { thumbs } from '@dicebear/collection'
import { createAvatar } from '@dicebear/core'

const cache = new Map<number, string>()

/** Same player id, same avatar, always. Generated locally, no external service. */
export function avatarUri(playerId: number): string {
  let uri = cache.get(playerId)
  if (!uri) {
    uri = createAvatar(thumbs, { seed: `gei-player-${playerId}` }).toDataUri()
    cache.set(playerId, uri)
  }
  return uri
}
