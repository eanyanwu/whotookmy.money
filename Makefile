run:
	PORT=8080 npm run start

check:
	npm run check

test:
	npm run test
	npx prettier --list-different src

fmt:
	npx prettier --write src

build:
	# Install all dependencies. devDependencies are needed (e.g. typescript)
	npm ci 
	# Transpilie typescript to javascript.
	npx tsc --outDir dist
	# Copy assets over
	mkdir -p dist/templates
	mkdir -p dist/assets
	cp src/templates/* dist/templates
	cp src/assets/* dist/assets
	# Use pkg to convert the resulting JS into a single executable
	pkg --target node18-linux-x64 --output pkg/wtmm_server --config package.json dist/index.js 
	
# Just in case I start doing anything special for release builds 
build-release: build

ansible-deploy:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=dev" deploy.yml

ansible-deploy-prod:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=prod" deploy.yml

ansible-provision:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts provision.yml
