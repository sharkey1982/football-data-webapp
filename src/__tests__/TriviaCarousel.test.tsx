import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { recordVisit, _resetVisitedPages } from '../lib/visitedPages';
import { render as rtlRender, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TriviaCarousel } from '../components/TriviaCarousel';
import type { TriviaFact } from '../lib/landingApi';

const facts: TriviaFact[] = [
  { question: 'Q1?', options: ['A', 'B', 'C'], correct: [1], explanation: 'B was right.', optionDetails: ['A: 10%', 'B: 30%', 'C: 20%'], link: { to: '/results-data', label: 'Explore every result' } },
  { question: 'Q2?', options: ['D', 'E', 'F'], correct: [0], explanation: 'D was right.', link: { to: '/table', label: 'Table' } },
  { question: 'Q3?', options: ['G', 'H', 'I'], correct: [2], explanation: 'I was right.', link: { to: '/fpl/value', label: 'Value' } },
];

// The carousel renders router Links (to the page holding each answer).
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

// Always restore real timers after each test, not just at the end of a
// passing test body -- a failed assertion mid-test would otherwise skip
// a trailing vi.useRealTimers() call and leave fake timers active for
// the next test, hanging anything (like userEvent) that relies on real
// timers internally.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  _resetVisitedPages();
});

// The carousel now shuffles (unvisited pages first, random within). These
// tests pin Math.random so Fisher-Yates keeps the given order and they can
// test everything else; the ordering itself is tested at the end.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.9999);
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

  // CHANGED BEHAVIOUR (Trivia v2): the carousel used to auto-advance 7s
  // after a guess, pausing on hover. With every option's figure and a link
  // to read, that was too fast to follow, so it now waits for the reader.
  it('stays on the answer however long the reader takes -- it never auto-advances after a guess', () => {
    vi.useFakeTimers();
    render(<TriviaCarousel facts={facts} />);
    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    act(() => {
      vi.advanceTimersByTime(120000);
    });
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.getByText('B was right.')).toBeInTheDocument();
  });

  it('offers "Next question" after a guess, which moves on and resets to unanswered', () => {
    render(<TriviaCarousel facts={facts} />);
    expect(screen.queryByRole('button', { name: /Next question/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.queryByText('D was right.')).not.toBeInTheDocument();
  });

  it('reveals every option\u2019s own figure only after a guess -- not just the right one', () => {
    render(<TriviaCarousel facts={facts} />);
    expect(screen.queryByText('A: 10%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^A/ }));
    expect(screen.getByText('A: 10%')).toBeInTheDocument();
    expect(screen.getByText('B: 30%')).toBeInTheDocument();
    expect(screen.getByText('C: 20%')).toBeInTheDocument();
  });

  it('links to the page that holds the answer, once answered', () => {
    render(<TriviaCarousel facts={facts} />);
    expect(screen.queryByRole('link', { name: /Explore every result/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^B/ }));
    expect(screen.getByRole('link', { name: /Explore every result/ })).toHaveAttribute('href', '/results-data');
  });

  it('with a genuine tie, every tied option is correct and picking any of them counts as right', () => {
    const tie: TriviaFact[] = [{ question: 'Tie?', options: ['X', 'Y', 'Z'], correct: [0, 2], explanation: 'X and Z tie.', link: { to: '/a', label: 'A' } }];
    render(<TriviaCarousel facts={tie} />);
    fireEvent.click(screen.getByRole('button', { name: /^Z/ }));
    expect(screen.getByText('Right')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^X/ }).textContent).toContain('\u2713');
    expect(screen.getByRole('button', { name: /^Z/ }).textContent).toContain('\u2713');
    expect(screen.getByRole('button', { name: /^Y/ }).textContent).not.toContain('\u2713');
  });

  it('when every option is correct, says so', () => {
    const all: TriviaFact[] = [{ question: 'All?', options: ['P', 'Q'], correct: [0, 1], explanation: 'All of them.', link: { to: '/b', label: 'B' } }];
    render(<TriviaCarousel facts={all} />);
    fireEvent.click(screen.getByRole('button', { name: /^Q/ }));
    expect(screen.getByText(/so was every other option/)).toBeInTheDocument();
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

  it('leads with questions about pages not yet visited this session', () => {
    recordVisit('/results-data'); // Q1's page
    render(<TriviaCarousel facts={facts} />);
    expect(screen.getByText('Q2?')).toBeInTheDocument(); // an unvisited page's question comes first
  });
});
