import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FolderPicker } from './FolderPicker'
import type { TreeNode } from '../../../shared/utils/fileTree'

// Covers DOC-4.3-41, 4.3-42, 4.3-43, 4.3-44, 4.3-45, 4.3-46.

const TREE: TreeNode[] = [
  {
    name: 'docs',
    path: 'docs',
    type: 'folder',
    children: [
      {
        name: 'notes',
        path: 'docs/notes',
        type: 'folder',
        children: [],
      },
      {
        name: 'intro.md',
        path: 'docs/intro.md',
        type: 'file',
        fileType: 'document',
      },
    ],
  },
  {
    name: 'diagram.json',
    path: 'diagram.json',
    type: 'file',
    fileType: 'diagram',
  },
  {
    name: 'readme.md',
    path: 'readme.md',
    type: 'file',
    fileType: 'document',
  },
]

describe('FolderPicker', () => {
  it('DOC-4.3-41: shows subfolders and files of the current directory', () => {
    render(<FolderPicker tree={TREE} startPath="" onSelect={vi.fn()} />)

    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('diagram.json')).toBeInTheDocument()
    expect(screen.getByText('readme.md')).toBeInTheDocument()
    // header shows "Root" at vault root
    expect(screen.getByText('Root')).toBeInTheDocument()
  })

  it('DOC-4.3-42: clicking a subfolder drills into it', () => {
    render(<FolderPicker tree={TREE} startPath="" onSelect={vi.fn()} />)

    fireEvent.mouseDown(screen.getByText('docs'))

    // header now shows the folder name
    expect(screen.getByText('docs')).toBeInTheDocument()
    // contents are the children of docs/
    expect(screen.getByText('notes')).toBeInTheDocument()
    expect(screen.getByText('intro.md')).toBeInTheDocument()
    // root-level items no longer shown
    expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
  })

  it('DOC-4.3-43: back arrow navigates up one level', () => {
    render(<FolderPicker tree={TREE} startPath="docs" onSelect={vi.fn()} />)

    // we are inside docs/ — click back
    const back = screen.getByRole('button')
    fireEvent.mouseDown(back)

    // back at root: header "Root", root items visible
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })

  it('DOC-4.3-44: back arrow is hidden at vault root', () => {
    render(<FolderPicker tree={TREE} startPath="" onSelect={vi.fn()} />)

    // no back button at root
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('DOC-4.3-45: clicking a file calls onSelect with its path', () => {
    const onSelect = vi.fn()
    render(<FolderPicker tree={TREE} startPath="" onSelect={onSelect} />)

    fireEvent.mouseDown(screen.getByText('readme.md'))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('readme.md')
  })

  it('DOC-4.3-46: empty folder shows "Empty folder" message', () => {
    render(<FolderPicker tree={TREE} startPath="docs/notes" onSelect={vi.fn()} />)

    expect(screen.getByText('Empty folder')).toBeInTheDocument()
  })
})
