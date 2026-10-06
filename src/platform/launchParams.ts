// Platform adapter: developer launch parameters. Native apps have none.
// The browser build reads them from the page URL (launchParams.web.ts), e.g.
// ?open=devtools&preset=fire-hd8-landscape&learner=learner-test-a&scenario=rescue-generic
export function launchParams(): Record<string, string> {
  return {};
}
