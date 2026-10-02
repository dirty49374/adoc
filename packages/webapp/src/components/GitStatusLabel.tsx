/** _Git_Status_Label_: a git icon with "git" or "no git", beside the connection status. */
export function GitStatusLabel({ git }: { git: boolean }) {
  return (
    <span className={`git-status ${git ? 'present' : 'absent'}`} data-testid="git-status" title={git ? 'The workspace is in a git repository' : 'The workspace is not in a git repository'}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M15.7 7.3 8.7.3a1 1 0 0 0-1.4 0L5.8 1.8l1.8 1.8a1.2 1.2 0 0 1 1.5 1.5l1.7 1.7a1.2 1.2 0 1 1-.7.7L8.5 5.9v4.3a1.2 1.2 0 1 1-1-.1V5.8a1.2 1.2 0 0 1-.6-1.6L5.1 2.5.3 7.3a1 1 0 0 0 0 1.4l7 7a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4Z"
        />
      </svg>
      {git ? 'git' : 'no git'}
    </span>
  );
}
