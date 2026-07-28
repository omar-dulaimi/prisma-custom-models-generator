import { generatorHandler } from '@prisma/generator-helper';
import { generate } from './prisma-generator';

generatorHandler({
  onManifest: () => ({
    defaultOutput: './generated',
    prettyName: 'Prisma Custom Models Generator',
    // `requiresGenerators` is deliberately absent.
    //
    // Prisma enforces it as an exact string match against every generator's
    // `provider`, with no aliasing between `prisma-client-js` and the
    // `prisma-client` provider that is recommended on Prisma 7. Declaring
    // `['prisma-client-js']` therefore hard-failed `prisma generate` for
    // everyone on the recommended path, and because the check is an AND it
    // cannot express "either provider". The presence check now happens in
    // `generate`, where it can accept both and warn instead of aborting.
  }),
  onGenerate: generate,
});
