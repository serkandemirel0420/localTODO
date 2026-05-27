PORT ?= 8083

.PHONY: install start start-clear start-dev start-dev-tunnel start-local start-tunnel ios android android-dev android-release android-release-install android-dev-cloud android-preview-cloud web typecheck check audit clean

install:
	npm install

start:
	npm run start -- --lan --port $(PORT)

start-clear:
	npm run start -- --lan --port $(PORT) --clear

start-dev:
	npm run start -- --dev-client --lan --port $(PORT) --clear

start-dev-tunnel:
	npm run start -- --dev-client --tunnel --port $(PORT) --clear

start-local:
	npm run start -- --localhost --port $(PORT)

start-tunnel:
	npm run start -- --tunnel --port $(PORT)

ios:
	npm run ios -- --lan --port $(PORT)

android:
	npm run android -- --lan --port $(PORT)

android-dev:
	npx expo run:android --port $(PORT)

android-release:
	./android/gradlew -p android :app:assembleRelease

android-release-install:
	./android/gradlew -p android :app:installRelease

android-dev-cloud:
	npx eas-cli build --platform android --profile development

android-preview-cloud:
	npx eas-cli build --platform android --profile preview

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
