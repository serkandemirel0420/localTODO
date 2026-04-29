PORT ?= 8083

.PHONY: install start start-clear start-local start-tunnel ios android web typecheck check audit clean

install:
	npm install

start:
	npm run start -- --lan --port $(PORT)

start-clear:
	npm run start -- --lan --port $(PORT) --clear

start-local:
	npm run start -- --localhost --port $(PORT)

start-tunnel:
	npm run start -- --tunnel --port $(PORT)

ios:
	npm run ios -- --lan --port $(PORT)

android:
	npm run android -- --lan --port $(PORT)

web:
	npm run web -- --lan --port $(PORT)

typecheck:
	npm run typecheck

check: typecheck
	npx expo install --check

audit:
	npm audit

clean:
	rm -rf .expo dist
