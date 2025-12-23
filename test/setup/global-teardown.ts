import 'tsconfig-paths/register';

import { TestSetup } from './test-setup';

export default async function globalTeardown() {
  await TestSetup.teardownApp();
}
