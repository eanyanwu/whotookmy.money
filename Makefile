test:
	npm run test
	npx prettier --list-different src

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
	pkg --target node16-linux-x64 --output pkg/wtmm_server --config package.json dist/index.js 
	
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

# It is often useful to get a copy of the prod/dev database files
# Make sure that the deployment private key has been registered with the ssh agent
download-dev-db:
	mkdir -p tmp
	cd tmp && scp deploy-user@whotookmy.money:~/.dev_wtmm/wtmm.db dev_wtmm.db

download-prod-db:
	mkdir -p tmp
	cd tmp && scp deploy-user@whotookmy.money:~/.wtmm/wtmm.db wtmm.db
	
