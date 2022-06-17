run:
	cd backend && PORT=8080 npm run server

test:
	cd backend && npm run test

fmt:
	cd backend && npm run fmt

build:
	cd backend && \
		npm install && \
		npm run build && \
		pkg --target node18-linux-x64 --output pkg/wtmm_server dist/index.js

ansible-deploy:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=dev" deploy.yml

ansible-deploy-prod:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=prod" deploy.yml

ansible-provision:
	cd ansible && \
		ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts provision.yml
