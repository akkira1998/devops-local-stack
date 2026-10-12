.PHONY: help up down logs health test load-test db-init clean rebuild restart metrics grafana ps build

help:
	@echo "DevOps Local Stack - Available Commands"
	@echo ""
	@echo "Core Operations:"
	@echo "  make up              - Start all services"
	@echo "  make down            - Stop all services"
	@echo "  make restart         - Restart all services"
	@echo "  make clean           - Stop and remove volumes"
	@echo ""
	@echo "Debugging:"
	@echo "  make logs            - View app logs"
	@echo "  make ps              - List containers"
	@echo "  make health          - Check health"
	@echo ""
	@echo "Dashboards:"
	@echo "  make grafana         - Open Grafana"
	@echo "  make metrics         - Open Prometheus"
	@echo ""

up:
	@echo "🚀 Starting services..."
	docker-compose up -d
	@echo "✅ Services started!"
	@echo ""
	@echo "📊 Access these:"
	@echo "  App:        http://localhost"
	@echo "  Grafana:    http://localhost:3001 (admin/admin)"
	@echo "  Prometheus: http://localhost:9090"
	@echo "  RabbitMQ:   http://localhost:15672"
	@sleep 3
	@make health

down:
	@echo "🛑 Stopping services..."
	docker-compose down
	@echo "✅ Services stopped"

restart: down up

logs:
	docker-compose logs -f app

ps:
	docker-compose ps

health:
	@bash scripts/health-check.sh

grafana:
	@echo "Opening Grafana..."
	@echo "http://localhost:3001"

metrics:
	@echo "Opening Prometheus..."
	@echo "http://localhost:9090"

clean:
	@echo "Removing containers and volumes..."
	docker-compose down -v
	@echo "✅ Cleaned"

rebuild:
	docker-compose build --no-cache
