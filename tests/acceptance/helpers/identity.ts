import request from 'supertest';

/**
 * Creates an identity the way a real client does: `POST /api/v1/auth/anonymous`.
 *
 * `identityFor()` in the business helpers upserts a user row directly, which is fine for specs that
 * only need a credential. It is not faithful enough for acceptance flows: the server validates a
 * caller against the user it knows about, so a row written behind the API's back is rejected with
 * "current anonymous session user does not exist" (404). Going through the endpoint keeps the fixture
 * on the same path a first launch takes, which is the point of an acceptance run.
 */
export type IssuedIdentity = { userId: string; credential: string };

export async function createIdentity(server: any, label: string): Promise<IssuedIdentity> {
  const response = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: label });
  if (response.status !== 201 || !response.body?.item?.credential) {
    throw new Error(`could not issue an identity (${response.status}): ${JSON.stringify(response.body).slice(0, 200)}`);
  }
  return { userId: response.body.item.userId, credential: response.body.item.credential };
}
