// Guard for scripts that change data: shows which database and media folder they would
// change and only continues with --yes (so they are not run against production by accident,
// e.g. with "railway run").
import path from 'path'

export function requireConfirmation(action: string, mediaDir?: string): void {
  // Only the location, never credentials (a remote URI may carry a token as query parameter)
  const database = (process.env.DATABASE_URI || 'file:./tripnjungle.db').split('?')[0]

  console.log(`${action}`)
  console.log(`  database:     ${database}`)

  if (mediaDir) {
    console.log(`  media folder: ${path.resolve(mediaDir)}`)
  }

  if (!process.argv.includes('--yes')) {
    console.log('\nNothing changed. Run again with --yes to continue.')
    process.exit(1)
  }
}

// Command line arguments without the --yes flag
export function positionalArgs(): string[] {
  return process.argv.slice(2).filter((arg) => arg !== '--yes')
}
