import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriviaCarousel } from '../components/TriviaCarousel';
import type { TriviaFact } from '../lib/landingApi';

const facts: TriviaFact[] = [
  { question: 'Q1?', options: ['A', 'B', 'C'], correctIndex: 1, explanation: 'B was right.' },
  { question: 'Q2?', options: ['D', 'E', 'F'], correctIndex: 0, explanation: 'D was right.' },
  { question: 'Q3?', options: ['G', 'H', 'I'], correctIndex: 2, explanation: 'I was right.' },
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
  it('shows the question and every option, with no explanation and no right/wrong marking before a guess', () => {
    render(<TriviaCarousel facts={facts} />);
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument();
    expect(screen.queryByText('B was right.')).not.toBeInTheDocument();
  });

  it('marks a correct guess, shows the explanation, and disables further picks -- and never advances on its own before a guess is made', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    act(() => {
      vi.advanceTimersByTime(30000); // well past any reasonable auto-advance window
    });
    expect(screen.getByText('Q1?')).toBeInTheDocument(); // still on Q1, unanswered

    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    expect(screen.getByText('B was right.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^B/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^A/ })).toBeDisabled();
  });

  it('marks a wrong guess as wrong while still revealing the correct one', () => {
    render(<TriviaCarousel facts={facts} />);
    fireEvent.click(screen.getByRole('button', { name: /^A/ })); // A is wrong, B is correct

    expect(screen.getByRole('button', { name: /^A/ }).textContent).toContain('\u2717'); // cross on the wrong pick
    expect(screen.getByRole('button', { name: /^B/ }).textContent).toContain('\u2713'); // check on the right answer
    expect(screen.getByText('B was right.')).toBeInTheDocument();
  });

  it('auto-advances to the next question a few seconds after a guess, resetting to unanswered', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    expect(screen.getByText('B was right.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('D was right.')).not.toBeInTheDocument(); // unanswered again on the new question
  });

  it('pauses the post-answer auto-advance while hovered', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);

    const container = screen.getByText('Q1?').closest('div')!;
    fireEvent.mouseEnter(container);
    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText('Q1?')).toBeInTheDocument(); // never advanced while hovered

    fireEvent.mouseLeave(container);
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Q2?')).toBeInTheDocument();
  });

  it('lets a person manually step forward, back, and jump via the dots -- each resetting to unanswered', async () => {
    render(<TriviaCarousel facts={facts} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Next fact' }));
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('D was right.')).not.toBeInTheDocument();

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
