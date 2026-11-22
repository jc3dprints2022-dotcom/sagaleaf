'use client'
import { useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import { buildLeafModel, type LeafModel } from './leafModel'

export function useLeafModel(opts: { screenTexture?: THREE.Texture | null; lowDetail?: boolean; skinColor?: string }): LeafModel {
  // Built once per mount; the skin colour is changed imperatively afterwards.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leaf = useMemo(() => buildLeafModel(opts), [opts.screenTexture, opts.lowDetail])
  useEffect(() => () => leaf.dispose(), [leaf])
  return leaf
}
