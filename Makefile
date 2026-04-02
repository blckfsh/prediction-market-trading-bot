# Project automation for local development.
# Requires GNU Make (on Windows, use Git Bash, WSL, or make via Chocolatey/Scoop).

NPM ?= npm

.PHONY: help install build lint format \
	start dev debug prod \
	test test-watch test-cov test-e2e test-db \
	schema-sync zenstack-generate prisma-generate \
	migrate migrate-name migrate-deploy migrate-status

help:
	@echo "Available targets:"
	@echo "  make install            - Install dependencies"
	@echo "  make dev                - Run app in watch mode"
	@echo "  make prod               - Build and run production app"
	@echo "  make build              - Build Nest app"
	@echo "  make lint               - Run eslint --fix"
	@echo "  make format             - Run prettier"
	@echo "  make test               - Run unit tests"
	@echo "  make test-watch         - Run tests in watch mode"
	@echo "  make test-cov           - Run tests with coverage"
	@echo "  make test-e2e           - Run e2e tests"
	@echo "  make test-db            - Run DB connection test"
	@echo "  make schema-sync        - Generate prisma schema from zmodel + prisma client"
	@echo "  make zenstack-generate  - Generate ZenStack artifacts and prisma schema"
	@echo "  make prisma-generate    - Generate Prisma client from prisma schema"
	@echo "  make migrate            - Run prisma migrate dev"
	@echo "  make migrate-name NAME=your_migration_name"
	@echo "  make migrate-status     - Show prisma migrate status"
	@echo "  make migrate-deploy     - Run prisma migrate deploy"

install:
	$(NPM) install

build:
	$(NPM) run build

lint:
	$(NPM) run lint

format:
	$(NPM) run format

start:
	$(NPM) run start

dev:
	$(NPM) run start:dev

debug:
	$(NPM) run start:debug

prod: build
	$(NPM) run start:prod

test:
	$(NPM) run test

test-watch:
	$(NPM) run test:watch

test-cov:
	$(NPM) run test:cov

test-e2e:
	$(NPM) run test:e2e

test-db:
	$(NPM) run db:check

schema-sync:
	$(NPM) run schema:sync

zenstack-generate:
	$(NPM) run zenstack:generate

prisma-generate:
	npx prisma generate --schema lib/prisma/schema.prisma

migrate:
	$(NPM) run db:migrate

migrate-name:
	@if [ -z "$(NAME)" ]; then \
		echo "Usage: make migrate-name NAME=your_migration_name"; \
		exit 1; \
	fi
	$(NPM) run db:migrate:name -- $(NAME)

migrate-status:
	$(NPM) run db:migrate:status

migrate-deploy:
	$(NPM) run db:migrate:deploy
