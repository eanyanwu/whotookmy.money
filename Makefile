run:
	cd backend && PORT=8080 npm run server

check:
	cd backend && npm run check

test:
	cd backend && npm run test

fmt:
	cd backend && npm run fmt

build:
	cd backend && \
		npm install && \
		npm run build && \
		pkg --target node18-linux-x64 --output pkg/wtmm_server dist/index.js

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
