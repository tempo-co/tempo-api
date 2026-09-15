import {INestApplication, ValidationPipe} from '@nestjs/common';
import {NestExpressApplication} from '@nestjs/platform-express';
import {Test} from '@nestjs/testing';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

let app: INestApplication<Server>;
let aiCategorizationEnabled = false;

export function enableAiCategorizationE2e(): void {
	aiCategorizationEnabled = true;
}

beforeAll(async () => {
	process.env.NODE_ENV = 'test';
	process.env.AI_CATEGORIZATION_ENABLED = String(aiCategorizationEnabled);

	if (aiCategorizationEnabled) {
		process.env.AI_CATEGORIZATION_PROVIDER = 'openai';
		process.env.AI_CATEGORIZATION_MODEL = 'test-model';
		process.env.OPENAI_API_KEY = 'test-only-placeholder';
	} else {
		delete process.env.OPENAI_API_KEY;
	}

	const [{seedAccounts}, {AppModule}] = await Promise.all([
		import('../../scripts/seed-data/seed-accounts'),
		import('../../src/app.module'),
	]);
	const moduleFixture = await Test.createTestingModule({imports: [AppModule]}).compile();
	app = moduleFixture.createNestApplication({forceCloseConnections: true});
	(app as NestExpressApplication).set('query parser', 'extended');
	app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}));
	await app.init();

	await seedAccounts(app);
});

afterAll(async () => {
	if (app) await app.close();
});

export function getApp() {
	return app;
}

export async function loginAgent(httpServer: Server, email: string, password: string): Promise<TestAgent> {
	const agent = request.agent(httpServer);
	await agent.post('/auth/login').send({email, password}).expect(200);
	return agent;
}
