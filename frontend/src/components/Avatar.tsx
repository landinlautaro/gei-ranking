import { useState } from 'react'
import type { PlayerRef } from '../api/types'
import { avatarUri } from '../lib/avatar'

const sizes = { sm: 'size-8', md: 'size-8 sm:size-10', lg: 'size-24' } as const

interface AvatarProps {
  player: Pick<PlayerRef, 'id' | 'photoPath'>
  size?: keyof typeof sizes
}

/** The photo when there is one (and it loads), otherwise the generated avatar. Decorative: the name is always next to it. */
export function Avatar({ player, size = 'md' }: AvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const src = player.photoPath && !photoFailed ? player.photoPath : avatarUri(player.id)

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setPhotoFailed(true)}
      className={`${sizes[size]} shrink-0 rounded-full bg-slate-200 object-cover`}
    />
  )
}
