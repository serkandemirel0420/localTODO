PORT ?= 8083
ANDROID_DEV_PACKAGE ?= com.localtodo.app.dev

.PHONY: install start start-clear start-dev start-dev-tunnel start-dev-usb start-local start-tunnel ios android android-dev android-open-metro android-release android-release-install android-dev-cloud android-preview-cloud web desktop-build desktop-install typecheck check audit clean

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

start-dev-usb:
	adb reverse tcp:$(PORT) tcp:$(PORT)
	npm run start -- --dev-client --localhost --port $(PORT) --clear

android-open-metro:
	adb reverse tcp:$(PORT) tcp:$(PORT)
	adb shell am force-stop $(ANDROID_DEV_PACKAGE)
	adb shell am start -a android.intent.action.VIEW -d "exp+local-todo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A$(PORT)" $(ANDROID_DEV_PACKAGE)

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

desktop-build:
	npm run desktop:build

desktop-install:
	npm run desktop:install

typecheck:
	npm run typecheck

check: typecheck
	npx expo install --check

audit:
	npm audit

clean:
	rm -rf .expo dist
