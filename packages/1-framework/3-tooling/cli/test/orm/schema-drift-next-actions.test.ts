import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { schemaDriftNextActions } from '../../src/orm/db/verification';
import { createTestProjectDir } from '../utils/test-project-dir';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function projectDir(): string {
  const dir = createTestProjectDir('schema-drift-next-actions');
  dirs.push(dir);
  return dir;
}

const DB_UPDATE = {
  kind: 'run-command',
  label: 'Change the database to match the contract, then sign again',
  command: '{bin} db update',
};

const HAND_EDIT = {
  kind: 'user-choice',
  label:
    'Or change the contract to describe the database as it is, re-run contract emit, then sign again',
};

describe('schemaDriftNextActions', () => {
  it('asks a Prisma 6 project to change its schema first if Prisma 6 still manages the database', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'prisma6', inputs: ['/project/prisma/schema.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([
      {
        kind: 'user-choice',
        label:
          'If Prisma 6 still manages this database, change prisma/schema.prisma to describe it as it is, re-run contract emit, then sign again',
      },
      {
        kind: 'run-command',
        label:
          'Or, if Prisma 8 manages it, change the database to match the contract, then sign again',
        command: '{bin} db update',
      },
    ]);
  });

  it('names Prisma 7 for a Prisma 7 source', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'prisma7', inputs: ['/project/schema.prisma'] },
        verb: 'verify',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([
      {
        kind: 'user-choice',
        label:
          'If Prisma 7 still manages this database, change schema.prisma to describe it as it is, re-run contract emit, then verify again',
      },
      {
        kind: 'run-command',
        label:
          'Or, if Prisma 8 manages it, change the database to match the contract, then verify again',
        command: '{bin} db update',
      },
    ]);
  });

  it('falls back to a generic schema name when the Prisma 6 or 7 source declares no inputs', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'prisma7', inputs: [] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      })[0],
    ).toEqual({
      kind: 'user-choice',
      label:
        'If Prisma 7 still manages this database, change your schema.prisma to describe it as it is, re-run contract emit, then sign again',
    });
  });

  it('names the schema files under a Prisma 7 schema directory', () => {
    const cwd = projectDir();
    mkdirSync(join(cwd, 'prisma'));

    expect(
      schemaDriftNextActions({
        source: { format: 'prisma7', inputs: [join(cwd, 'prisma')] },
        verb: 'sign',
        cwd,
        canInferContract: true,
        contractRef: undefined,
      })[0],
    ).toEqual({
      kind: 'user-choice',
      label:
        'If Prisma 7 still manages this database, change the schema files under prisma to describe it as it is, re-run contract emit, then sign again',
    });
  });

  it('names this directory when the Prisma 7 schema directory is the working directory', () => {
    const cwd = projectDir();

    expect(
      schemaDriftNextActions({
        source: { format: 'prisma7', inputs: [cwd] },
        verb: 'sign',
        cwd,
        canInferContract: true,
        contractRef: undefined,
      })[0],
    ).toEqual({
      kind: 'user-choice',
      label:
        'If Prisma 7 still manages this database, change the schema files under this directory to describe it as it is, re-run contract emit, then sign again',
    });
  });

  it('offers db update, then contract infer into the one PSL source file', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'psl', inputs: ['/project/prisma/contract.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([
      DB_UPDATE,
      {
        kind: 'run-command',
        label:
          'Or replace prisma/contract.prisma with a contract inferred from the database, then re-emit and sign again',
        command: '{bin} contract infer --output "prisma/contract.prisma"',
      },
    ]);
  });

  it('offers a hand edit instead of contract infer when the family cannot infer a contract', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'psl', inputs: ['/project/prisma/contract.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: false,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers a hand edit instead of contract infer when the one PSL input is a glob', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'psl', inputs: ['/project/prisma/*.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers a hand edit instead of contract infer when the PSL source has several files', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'psl', inputs: ['/project/a.prisma', '/project/b.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers a hand edit instead of contract infer when the PSL source declares no inputs', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'psl' },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers db update, then a hand edit of the contract, to a TypeScript project', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'typescript', inputs: [] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers db update, then a hand edit of the contract, for an unknown format', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'custom', inputs: ['/project/schema.x'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('offers db update, then a hand edit of the contract, when the source declares no format', () => {
    expect(
      schemaDriftNextActions({
        source: { inputs: ['/project/contract.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });

  it('aims db update at the ref being signed', () => {
    expect(
      schemaDriftNextActions({
        source: undefined,
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: 'staging',
      }),
    ).toEqual([{ ...DB_UPDATE, command: '{bin} db update --to "staging"' }, HAND_EDIT]);
  });

  it('aims the Prisma 6 and 7 db update action at the ref being signed', () => {
    expect(
      schemaDriftNextActions({
        source: { format: 'prisma7', inputs: ['/project/schema.prisma'] },
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: 'staging',
      })[1],
    ).toEqual({
      kind: 'run-command',
      label:
        'Or, if Prisma 8 manages it, change the database to match the contract, then sign again',
      command: '{bin} db update --to "staging"',
    });
  });

  it('offers db update, then a hand edit of the contract, when the config has no source', () => {
    expect(
      schemaDriftNextActions({
        source: undefined,
        verb: 'sign',
        cwd: '/project',
        canInferContract: true,
        contractRef: undefined,
      }),
    ).toEqual([DB_UPDATE, HAND_EDIT]);
  });
});
