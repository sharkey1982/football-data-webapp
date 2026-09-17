import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriviaCarousel } from '../components/TriviaCarousel';

const facts = [
  { question: 'Q1?', answer: 'A1.' },
  { question: 'Q2?', answer: 'A2.' },
  { question: 'Q3?', answer: 'A3.' },
];

// Always restore real timers after each test, not just at the end of a
// passing test body -- a failed assertion mid-test would otherwise skip
// a trailing vi.useRealTimers() call and leave fake timers active for
// the next test, hanging anything (like userEvent) that relies on real
// timers internally.
afterEach(() => {
  vi.useRealTimers();
});

describe('TriviaCarousel', () => {
  it('shows only the question at first, with the answer hidden behind a reveal prompt', () => {
    render(<TriviaCarousel facts={facts} />);
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.queryByText('A1.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tap to reveal/ })).toBeInTheDocument();
  });

  it('reveals the answer once tapped, and never advances on its own before that happens', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    act(() => {
      vi.advanceTimersByTime(30000); // well past any reasonable auto-advance window
    });
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.queryByText('A1.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tap to reveal/ }));
    expect(screen.getByText('A1.')).toBeInTheDocument();
  });

  it('auto-advances to the next question a few seconds after a reveal, resetting to hidden again', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    fireEvent.click(screen.getByRole('button', { name: /Tap to reveal/ }));
    expect(screen.getByText('A1.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('A2.')).not.toBeInTheDocument(); // hidden again on the new question
  });

  it('pauses the post-reveal auto-advance while hovered', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    const container = screen.getByText('Q1?').closest('div')!;
    fireEvent.mouseEnter(container);
    fireEvent.click(screen.getByRole('button', { name: /Tap to reveal/ }));
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText('A1.')).toBeInTheDocument(); // never advanced while hovered

    fireEvent.mouseLeave(container);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
  });

  it('lets a person manually step forward, back, and jump via the dots -- each resetting to a hidden answer', async () => {
    render(<TriviaCarousel facts={facts} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Next fact' }));
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('A2.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous fact' }));
    expect(screen.getByText('Q1?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show fact 3 of 3' }));
    expect(screen.getByText('Q3?')).toBeInTheDocument();
  });

  it('shows no navigation controls, and never crashes, with only a single fact', () => {
    render(<TriviaCarousel facts={[facts[0]]} />);
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next fact' })).not.toBeInTheDocument();
  });

  it('renders nothing at all with zero facts, rather than an empty shell', () => {
    const { container } = render(<TriviaCarousel facts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
