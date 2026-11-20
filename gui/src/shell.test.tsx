import { render, screen } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';

beforeEach(() => {
  localStorage.clear();
});

test('shell renders brand, sections, footer', () => {
  render(<App client={new MockBridge()} />);
  expect(screen.getByTestId('app-root')).toBeInTheDocument();
  expect(screen.getByText('CLI GUI')).toBeInTheDocument();
  expect(screen.getByText('Projects')).toBeInTheDocument();
  // Skills + Subscription land in S6

  expect(screen.getByTestId('conn-text')).toHaveTextContent('Disconnected');
  expect(screen.getByTestId('project-value')).toHaveTextContent('None');
});