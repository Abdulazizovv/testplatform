.PHONY: help build up down restart restart-all logs celery-logs shell migrate makemigrations createsuperuser collectstatic test lint ps fe-dev fe-build fe-lint fe-logs

help:
	@echo "Available targets:"
	@echo "  build           - docker compose build"
	@echo "  up              - docker compose up -d"
	@echo "  down            - docker compose down"
	@echo "  ps              - show container status/health"
	@echo "  restart         - restart backend container"
	@echo "  restart-all     - restart backend and celery containers"
	@echo "  logs            - follow all logs"
	@echo "  celery-logs     - follow celery worker logs"
	@echo "  shell           - open django shell"
	@echo "  migrate         - run migrations"
	@echo "  makemigrations  - create new migrations"
	@echo "  createsuperuser - create a superadmin (role=superadmin)"
	@echo "  collectstatic   - collect static files"
	@echo "  test            - run Django tests (in the backend container)"
	@echo "  lint            - flake8 (backend, in container) + eslint (frontend, on host)"
	@echo "  fe-dev          - npm run dev in frontend/ on the host (http://localhost:3000)"
	@echo "  fe-build        - npm run build in frontend/ on the host"
	@echo "  fe-lint         - npm run lint in frontend/ on the host"
	@echo "  fe-logs         - follow frontend container logs"

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

ps:
	docker compose ps

restart:
	docker compose restart backend

restart-all:
	docker compose restart backend celery

logs:
	docker compose logs -f --tail=200

celery-logs:
	docker compose logs -f --tail=200 celery

shell:
	docker compose exec backend python manage.py shell

migrate:
	docker compose exec backend python manage.py migrate

makemigrations:
	docker compose exec backend python manage.py makemigrations

createsuperuser:
	docker compose exec backend python manage.py createsuperuser

collectstatic:
	docker compose exec backend python manage.py collectstatic --noinput

test:
	docker compose exec backend python manage.py test -v 2

# flake8 is a dev-only dependency (requirements-dev.txt), not in the prod image, so it is
# installed on the fly into the throwaway user site (container runs as non-root).
lint:
	docker compose exec backend sh -c "pip install -q --user flake8==7.4.1 && python -m flake8 --max-line-length=110 --exclude=migrations ."
	cd frontend && npm run lint

fe-dev:
	cd frontend && npm run dev

fe-build:
	cd frontend && npm run build

fe-lint:
	cd frontend && npm run lint

fe-logs:
	docker compose logs -f --tail=200 frontend
