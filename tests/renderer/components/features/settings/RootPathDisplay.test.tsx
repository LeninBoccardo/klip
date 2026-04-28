import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RootPathDisplay } from '@/components/features/settings/RootPathDisplay'

describe('RootPathDisplay', () => {
  it('renders the root path value', () => {
    const { container } = render(<RootPathDisplay rootPath="/home/test/klip" />)
    const input = container.querySelector('input')
    expect(input).toHaveValue('/home/test/klip')
  })

  it('renders "Not set" when rootPath is null', () => {
    const { container } = render(<RootPathDisplay rootPath={null} />)
    const input = container.querySelector('input')
    expect(input).toHaveValue('Not set')
  })

  it('renders "Not set" when rootPath is undefined', () => {
    const { container } = render(<RootPathDisplay rootPath={undefined} />)
    const input = container.querySelector('input')
    expect(input).toHaveValue('Not set')
  })

  it('renders a read-only input', () => {
    const { container } = render(<RootPathDisplay rootPath="/some/path" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('readonly')
  })

  it('renders the label text', () => {
    const { container } = render(<RootPathDisplay rootPath="/path" />)
    expect(container.textContent).toContain('Root directory')
  })
})
