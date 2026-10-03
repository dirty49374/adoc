import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// The tests never read the developer's own ~/.config/adoc/adoc.yaml: the user config directory points at a folder that does not exist.
export default defineConfig({ test: { env: { XDG_CONFIG_HOME: join(tmpdir(), 'adoc-test-no-user-config') } } });
