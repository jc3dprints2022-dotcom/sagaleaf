'use client'
import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { buildLeafModel, type LeafModel, type LeafModelOptions } from './leafModel'
import { acquireLeafGlb, buildLeafFromGltf } from './leafGlb'

export interface LeafLoadInfo { ms: number; bytes: number }

/**
 * Returns the model handle for one canvas: `null` while public/models/leaf.glb is loading (the
 * caller keeps its static poster up), then the rev 4 CAD model. If the GLB cannot be fetched or
 * parsed, it returns the procedural fallback instead, so a scene is never left empty.
 * `?model=procedural` forces the fallback (used to check it by eye).
 */
export function useLeafModel(opts: { screenTexture?: THREE.Texture | null; lowDetail?: boolean; skinColor?: string }): { leaf: LeafModel | null; load: LeafLoadInfo | null } {
  const [got, setGot] = useState<{ leaf: LeafModel; load: LeafLoadInfo | null } | null>(null)
  useEffect(() => {
    let alive = true
    let leaf: LeafModel | null = null
    let release = () => {}
    // The skin colour is changed imperatively afterwards, so it is not a dependency.
    const o: LeafModelOptions = { screenTexture: opts.screenTexture, lowDetail: opts.lowDetail, skinColor: opts.skinColor }
    const fallback = () => { if (alive) { leaf = buildLeafModel(o); setGot({ leaf, load: null }) } }
    if (/[?&]model=procedural\b/.test(location.search)) fallback()
    else acquireLeafGlb().then(r => {
      if (!alive) { r.release(); return }
      release = r.release
      leaf = buildLeafFromGltf(r.glb, o)
      setGot({ leaf, load: { ms: r.glb.ms, bytes: r.glb.bytes } })
    }).catch(err => {
      // Not an error state for the visitor: the fallback model takes over.
      console.info('[leaf] CAD model unavailable, using the procedural fallback:', err instanceof Error ? err.message : err)
      fallback()
    })
    return () => { alive = false; leaf?.dispose(); release(); setGot(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.screenTexture, opts.lowDetail])
  return { leaf: got?.leaf ?? null, load: got?.load ?? null }
}
