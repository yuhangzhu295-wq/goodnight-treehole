import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';
import { closeAppBounded } from './helpers/teardown';

/**
 * F11 - diary, letter and favourite ownership.
 *
 * These three are the private records a user writes for themselves, and each one has a route that
 * takes an id. The flow gives two real users one record each and then tries every id-taking route
 * from the other side. The routes used to ignore the caller entirely (delete diary, mark read, like,
 * regenerate, poster, save-to-diary, share-image), and `regenerate` even fell back to `letters[0]`
 * when the id was unknown - which is another user's letter whenever more than one exists.
 *
 * The positive half is asserted too: the owner can still do all of it, because a fix that simply
 * refuses everyone would pass the negative half.
 */
describe('F11 diary, letter and favourite ownership', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;

  let ownerCredential: string;
  let ownerUserId: string;
  let strangerCredential: string;

  let diaryId: string;
  let letterId: string;
  let favouriteId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F11');
    const owner = await createIdentity(server, 'F11 owner');
    ownerCredential = owner.credential;
    ownerUserId = owner.userId;
    strangerCredential = (await createIdentity(server, 'F11 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await closeAppBounded(app, 'app');
  });

  it('keeps every id-taking diary and letter route inside its owner', async () => {
    // 1. The owner writes a diary and it reaches the table.
    const diary = await request(server)
      .post('/api/v1/diaries')
      .set('x-goodnight-user-id', ownerCredential)
      .send({ content: 'F11：今天把窗户打开了。', emotion: '平静' });
    diaryId = diary.body?.item?.id;
    const diaryRow = diaryId ? await prisma.diary.findUnique({ where: { id: diaryId } }) : null;
    evidence.check({
      step: 'a diary is written and flushed to the table',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, rowOwnerMatches: true, content: 'F11：今天把窗户打开了。' },
      actual: {
        status: diary.status,
        rowOwnerMatches: diaryRow?.userId === ownerUserId,
        content: diaryRow?.content,
      },
      request: { method: 'POST', path: '/api/v1/diaries' },
      response: { status: diary.status, diaryId },
      sql: `select "userId", content from "Diary" where id = '${diaryId}'`,
    });
    expect(diary.status).toBe(201);
    expect(diaryRow?.userId).toBe(ownerUserId);

    // 2. The owner has a letter; its id is what the stranger will try.
    const generated = await request(server)
      .post('/api/v1/letters/generate')
      .set('x-goodnight-user-id', ownerCredential)
      .send({ style: 'warm' });
    letterId = generated.body?.item?.id;
    evidence.check({
      step: 'the owner has a letter',
      layer: 'API_EVIDENCE',
      expected: { status: 201, hasLetterId: true },
      actual: { status: generated.status, hasLetterId: Boolean(letterId) },
      request: { method: 'POST', path: '/api/v1/letters/generate' },
      response: { status: generated.status, letterId },
    });
    expect(generated.status).toBe(201);
    expect(letterId).toBeTruthy();

    // 3. The owner's favourite is a row the stranger will also try to remove.
    const favorited = await request(server)
      .post(`/api/v1/letters/${letterId}/favorite`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const favouriteRow = await prisma.favorite.findFirst({
      where: { userId: ownerUserId, targetType: 'letter', targetId: letterId },
    });
    favouriteId = favouriteRow?.id;
    const favourites = await request(server)
      .get('/api/v1/me/favorites?type=letter')
      .set('x-goodnight-user-id', ownerCredential);
    evidence.check({
      step: 'favouriting a letter writes an owned favourite row',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, rowOwnerMatches: true, listedForOwner: true },
      actual: {
        status: favorited.status,
        rowOwnerMatches: favouriteRow?.userId === ownerUserId,
        listedForOwner: (favourites.body?.items ?? []).some((item: any) => item.targetId === letterId),
      },
      request: { method: 'POST', path: `/api/v1/letters/${letterId}/favorite` },
      response: { status: favorited.status, favouriteId },
      sql: `select id, "userId" from "Favorite" where "targetId" = '${letterId}'`,
    });
    expect(favorited.status).toBe(201);
    expect(favouriteRow?.userId).toBe(ownerUserId);

    // 4. Every letter route refuses the stranger, and nothing moves.
    const strangerRead = await request(server)
      .patch(`/api/v1/letters/${letterId}/read`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const strangerLike = await request(server)
      .post(`/api/v1/letters/${letterId}/like`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const strangerRegenerate = await request(server)
      .post(`/api/v1/letters/${letterId}/regenerate`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ style: 'rational' });
    const strangerPoster = await request(server)
      .post(`/api/v1/letters/${letterId}/poster`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const strangerShare = await request(server)
      .post('/api/v1/share-image')
      .set('x-goodnight-user-id', strangerCredential)
      .send({ id: letterId, type: 'letter' });
    const strangerSave = await request(server)
      .post(`/api/v1/letters/${letterId}/save-to-diary`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const strangerDiaryDelete = await request(server)
      .delete(`/api/v1/diaries/${diaryId}`)
      .set('x-goodnight-user-id', strangerCredential);
    const strangerFavoriteDelete = await request(server)
      .delete(`/api/v1/favorites/${favouriteId}`)
      .set('x-goodnight-user-id', strangerCredential);

    const diaryRowAfter = await prisma.diary.findUnique({ where: { id: diaryId } });
    const favoriteRows = await prisma.favorite.count({
      where: { userId: ownerUserId, targetType: 'letter', targetId: letterId },
    });
    evidence.check({
      step: 'a stranger is refused on every letter and diary id route',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        read: 404,
        like: 404,
        regenerate: 404,
        poster: 404,
        share: 404,
        saveToDiary: 404,
        deleteDiary: 404,
        deleteFavorite: 200,
        diaryStillOwned: true,
        favouriteStillThere: 1,
      },
      actual: {
        read: strangerRead.status,
        like: strangerLike.status,
        regenerate: strangerRegenerate.status,
        poster: strangerPoster.status,
        share: strangerShare.status,
        saveToDiary: strangerSave.status,
        deleteDiary: strangerDiaryDelete.status,
        deleteFavorite: strangerFavoriteDelete.status,
        diaryStillOwned: diaryRowAfter?.userId === ownerUserId,
        favouriteStillThere: favoriteRows,
      },
      request: {
        method: 'mixed',
        paths: [
          `PATCH /api/v1/letters/${letterId}/read`,
          `POST /api/v1/letters/${letterId}/like`,
          `POST /api/v1/letters/${letterId}/regenerate`,
          `POST /api/v1/letters/${letterId}/poster`,
          `POST /api/v1/share-image`,
          `POST /api/v1/letters/${letterId}/save-to-diary`,
          `DELETE /api/v1/diaries/${diaryId}`,
          `DELETE /api/v1/favorites/${favouriteId}`,
        ],
        identity: 'unrelated user',
      },
      response: {
        read: strangerRead.status,
        like: strangerLike.status,
        regenerate: strangerRegenerate.status,
        poster: strangerPoster.status,
        share: strangerShare.status,
        saveToDiary: strangerSave.status,
        deleteDiary: strangerDiaryDelete.status,
        deleteFavorite: strangerFavoriteDelete.status,
      },
      sql: `select status, "likeCount" from "Letter" where id = '${letterId}'; select count(*) from "Favorite" where "targetId" = '${letterId}'`,
    });
    for (const [label, response] of Object.entries({
      read: strangerRead,
      like: strangerLike,
      regenerate: strangerRegenerate,
      poster: strangerPoster,
      share: strangerShare,
      saveToDiary: strangerSave,
      deleteDiary: strangerDiaryDelete,
    })) {
      expect(response.status, `${label} must be refused`).toBe(404);
    }
    // Deleting someone else's favourite is scoped by owner in the store, so it is a no-op that does
    // not disclose whether the id exists.
    expect(strangerFavoriteDelete.status).toBe(200);
    expect(favoriteRows).toBe(1);
    expect(diaryRowAfter?.userId).toBe(ownerUserId);

    // 5. The owner can do all of it.
    const ownerRead = await request(server)
      .patch(`/api/v1/letters/${letterId}/read`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const ownerLike = await request(server)
      .post(`/api/v1/letters/${letterId}/like`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const ownerPoster = await request(server)
      .post(`/api/v1/letters/${letterId}/poster`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const ownerSave = await request(server)
      .post(`/api/v1/letters/${letterId}/save-to-diary`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const letterAfterOwner = await prisma.letter.findUnique({ where: { id: letterId } });
    const diaryCount = await prisma.diary.count({ where: { userId: ownerUserId } });
    evidence.check({
      step: 'the owner can read, like, poster and save the letter',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        readStatus: 200,
        likeStatus: 201,
        posterStatus: 201,
        saveStatus: 201,
        letterStatus: 'read',
        likeCount: 1,
        diaryRows: 2,
      },
      actual: {
        readStatus: ownerRead.status,
        likeStatus: ownerLike.status,
        posterStatus: ownerPoster.status,
        saveStatus: ownerSave.status,
        letterStatus: letterAfterOwner?.status,
        likeCount: letterAfterOwner?.likeCount,
        diaryRows: diaryCount,
      },
      request: { method: 'mixed', identity: 'owner' },
      response: {
        read: ownerRead.status,
        like: ownerLike.status,
        poster: ownerPoster.status,
        save: ownerSave.status,
      },
      sql: `select status, "likeCount" from "Letter" where id = '${letterId}'; select count(*) from "Diary" where "userId" = '${ownerUserId}'`,
    });
    expect(ownerRead.status).toBe(200);
    expect(ownerLike.status).toBe(201);
    expect(ownerPoster.status).toBe(201);
    expect(ownerSave.status).toBe(201);
    expect(letterAfterOwner?.status).toBe('read');
    expect(letterAfterOwner?.likeCount).toBe(1);
    expect(diaryCount).toBe(2);

    // 6. The owner deletes the diary, and the delete reaches the table before the response.
    const ownerDelete = await request(server)
      .delete(`/api/v1/diaries/${diaryId}`)
      .set('x-goodnight-user-id', ownerCredential);
    const diaryAfterDelete = await prisma.diary.findUnique({ where: { id: diaryId } });
    const listAfterDelete = await request(server)
      .get('/api/v1/me/diaries')
      .set('x-goodnight-user-id', ownerCredential);
    evidence.check({
      step: 'the owner’s delete removes the row and the list entry',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, rowGone: true, listedAfter: false },
      actual: {
        status: ownerDelete.status,
        rowGone: diaryAfterDelete === null,
        listedAfter: (listAfterDelete.body?.items ?? []).some((item: any) => item.id === diaryId),
      },
      request: { method: 'DELETE', path: `/api/v1/diaries/${diaryId}` },
      response: { status: ownerDelete.status },
      sql: `select id from "Diary" where id = '${diaryId}'`,
    });
    expect(ownerDelete.status).toBe(200);
    expect(diaryAfterDelete).toBeNull();
    expect((listAfterDelete.body?.items ?? []).some((item: any) => item.id === diaryId)).toBe(false);
  });
});
