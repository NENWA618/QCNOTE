import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NormalMarkdown } from '../components/ColoredMarkdown';

// Reveals are remembered for the session (module state), so each test uses its own URL.
describe('external images in notes', () => {
  it('shows a placeholder instead of requesting the image', () => {
    const { container } = render(
      <NormalMarkdown content="![pixel](https://tracker.example/a.gif)" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button').textContent).toContain('tracker.example');
    expect(screen.getByRole('button').textContent).toContain('pixel');
  });

  it('loads the image on click, without a referrer', () => {
    const { container } = render(<NormalMarkdown content="![](https://img.example/b.png)" />);
    fireEvent.click(screen.getByRole('button'));
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img.example/b.png');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('can be loaded from the keyboard', () => {
    const { container } = render(<NormalMarkdown content="![](https://img.example/k.png)" />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('stays loaded while the note is edited', () => {
    const { container, rerender } = render(
      <NormalMarkdown content="![](https://img.example/c.png)" />,
    );
    fireEvent.click(screen.getByRole('button'));
    rerender(<NormalMarkdown content={'intro\n\n![](https://img.example/c.png)'} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://img.example/c.png');
  });

  it('does not load a different URL just because one was revealed', () => {
    const { container, rerender } = render(
      <NormalMarkdown content="![](https://img.example/d.png)" />,
    );
    fireEvent.click(screen.getByRole('button'));
    rerender(<NormalMarkdown content="![](https://img.example/e.png)" />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('inside a link, loads the image instead of following the link', () => {
    render(<NormalMarkdown content="[![](https://img.example/f.png)](https://site.example)" />);
    const placeholder = screen.getByRole('button');
    expect(placeholder.closest('a')).not.toBeNull();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    placeholder.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('loads same-site images directly', () => {
    const { container } = render(<NormalMarkdown content="![](/images/local.png)" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/local.png');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('treats protocol-relative URLs as external', () => {
    const { container } = render(<NormalMarkdown content="![](//cdn.example/g.png)" />);
    expect(container.querySelector('img')).toBeNull();
  });
});
