PORT ?= 8083

.PHONY: install start ios android web typecheck check audit clean

install:
	npm install

start:
	npm run start -- --localhost --port $(PORT)

ios:
	npm run ios -- --localhost --port $(PORT)

android:
	npm run android -- --localhost --port $(PORT)

web:
	npm run web -- --localhost --port $(PORT)

typecheck:
	npm run typecheck

check: typecheck
	npx expo install --check

audit:
	npm audit

clean:
	rm -rf .expo dist
