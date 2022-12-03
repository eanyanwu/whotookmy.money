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

ansible-container:
	# Remove the image if it already exists
	sudo docker rmi ansible-tmp-container || true
	# Build a new one
	cd ci-image && sudo docker build --tag ansible-tmp-container .
	# Start and run the shell in the container
	# --rm: Delete the container when the command exits
	# --volume <host>:<docker> : Mount our repo inside the container
	# --env: SSH_AUTH_SOCK holds the path to the socket used to communicate with ssh-agent. 
	# Since I want my host ssh-agent keys to be available in the container, I am mounting that socket
	# on the container as /ssh.socket.
	sudo docker run \
		--rm \
		--volume ${PWD}:${PWD} \
		--workdir ${PWD} \
		--volume ${SSH_AUTH_SOCK}:/ssh.socket \
		--env SSH_AUTH_SOCK=/ssh.socket \
		--interactive \
		--tty \
		ansible-tmp-container:latest \
		/bin/sh


