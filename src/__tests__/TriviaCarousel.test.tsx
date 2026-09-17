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
// timers internally. Confirmed directly: this is exactly what happened
// on the first pass at this file.
afterEach(() => {
  vi.useRealTimers();
});

describe('TriviaCarousel', () => {
  it('shows the first fact initially, and auto-rotates to the next one after the interval', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    expect(screen.getByText('Q1?')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('Q1?')).not.toBeInTheDocument();
  });

  it('pauses auto-rotation while hovered, and resumes once the pointer leaves', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    // The outer bordered wrapper itself carries the hover handlers --
    // one level up from the question <p>, not two.
    const container = screen.getByText('Q1?').closest('div')!;
    fireEvent.mouseEnter(container);
    act(() => {
      vi.advanceTimersByTime(15000); // well past two rotation intervals
    });
    expect(screen.getByText('Q1?')).toBeInTheDocument(); // never advanced while hovered

    fireEvent.mouseLeave(container);
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
  });

  it('lets a person manually step forward and back, and jump directly via the dots', async () => {
    render(<TriviaCarousel facts={facts} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Next fact' }));
    expect(screen.getByText('Q2?')).toBeInTheDocument();

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
