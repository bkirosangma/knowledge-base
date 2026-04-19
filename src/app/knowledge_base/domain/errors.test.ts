import { describe, it, expect } from 'vitest'
import { FileSystemError, classifyError, isFileSystemErrorOfKind } from './errors'
import { readOrNull } from './repositoryHelpers'

describe('FileSystemError', () => {
  it('carries kind + message + optional cause', () => {
    const cause = new Error('inner')
    const err = new FileSystemError('permission', 'denied', cause)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(FileSystemError)
    expect(err.name).toBe('FileSystemError')
    expect(err.kind).toBe('permission')
    expect(err.message).toBe('denied')
    expect(err.cause).toBe(cause)
  })
})

describe('classifyError', () => {
  it('FS-2.6-01: is idempotent on an existing FileSystemError', () => {
    const err = new FileSystemError('malformed', 'bad json')
    expect(classifyError(err)).toBe(err)
  })

  it('FS-2.6-02: maps DOMException NotFoundError → not-found', () => {
    // jsdom DOMException is constructable; fall back to Error-with-name
    // if the environment doesn't support it.
    const dom = typeof DOMException === 'function'
      ? new DOMException('missing', 'NotFoundError')
      : Object.assign(new Error('missing'), { name: 'NotFoundError' })
    const c = classifyError(dom)
    expect(c.kind).toBe('not-found')
    expect(c.message).toBe('missing')
    expect(c.cause).toBe(dom)
  })

  it('FS-2.6-03: maps NotAllowedError / SecurityError → permission', () => {
    const a = classifyError(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    const b = classifyError(Object.assign(new Error('blocked'), { name: 'SecurityError' }))
    expect(a.kind).toBe('permission')
    expect(b.kind).toBe('permission')
  })

  it('FS-2.6-04: maps QuotaExceededError → quota-exceeded', () => {
    const e = classifyError(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))
    expect(e.kind).toBe('quota-exceeded')
  })

  it('FS-2.6-05: falls through to unknown for other errors', () => {
    const e = classifyError(new Error('mystery'))
    expect(e.kind).toBe('unknown')
    expect(e.message).toBe('mystery')
  })

  it('FS-2.6-05: wraps non-Error throws', () => {
    const e = classifyError('string throw')
    expect(e.kind).toBe('unknown')
    expect(e.message).toBe('string throw')
  })
})

describe('isFileSystemErrorOfKind', () => {
  it('returns true for matching kind', () => {
    const err = new FileSystemError('not-found', '')
    expect(isFileSystemErrorOfKind(err, 'not-found')).toBe(true)
  })

  it('returns false for mismatched kind or non-FileSystemError', () => {
    const err = new FileSystemError('permission', '')
    expect(isFileSystemErrorOfKind(err, 'not-found')).toBe(false)
    expect(isFileSystemErrorOfKind(new Error('x'), 'not-found')).toBe(false)
    expect(isFileSystemErrorOfKind(null, 'not-found')).toBe(false)
  })
})

describe('readOrNull', () => {
  it('returns value on success', async () => {
    expect(await readOrNull(async () => 'ok')).toBe('ok')
  })

  it('FS-2.6-06: returns null on not-found', async () => {
    expect(await readOrNull(async () => {
      throw new FileSystemError('not-found', 'gone')
    })).toBeNull()
  })

  it('FS-2.6-07: re-throws permission / malformed / quota / unknown unchanged', async () => {
    const err = new FileSystemError('permission', 'denied')
    await expect(readOrNull(async () => { throw err })).rejects.toBe(err)
  })

  it('FS-2.6-07: classifies raw DOMException-like throws before re-throwing', async () => {
    let caught: unknown
    try {
      await readOrNull(async () => {
        throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(FileSystemError)
    expect((caught as FileSystemError).kind).toBe('permission')
  })
})
