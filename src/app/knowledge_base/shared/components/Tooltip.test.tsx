import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip (KB-036)', () => {
  it('SHELL-1.16-03: wires aria-describedby from the trigger to a [role="tooltip"] bubble', () => {
    render(
      <Tooltip label="Save (⌘S)">
        <button aria-label="Save">Save</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const bubble = screen.getByRole('tooltip', { hidden: true });
    expect(bubble.id).toBe(describedBy);
    expect(bubble).toHaveTextContent('Save (⌘S)');
  });

  it('SHELL-1.16-05: preserves an existing aria-describedby on the trigger by concatenating', () => {
    render(
      <Tooltip label="Bold">
        <button aria-label="Bold" aria-describedby="external-help">B</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    const describedBy = button.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);

    expect(ids).toContain('external-help');
    expect(ids.length).toBe(2);

    const bubble = screen.getByRole('tooltip', { hidden: true });
    expect(ids).toContain(bubble.id);
  });

  it('renders the bubble as a real DOM node so SR can announce its description', () => {
    render(
      <Tooltip label="Zoom in">
        <button aria-label="Zoom in">+</button>
      </Tooltip>,
    );
    expect(screen.getByText('Zoom in')).toBeInTheDocument();
  });
});
