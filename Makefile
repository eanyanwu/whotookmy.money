build:
	cd wtmm && cargo build --locked

build-release:
	cd wtmm && cargo build --locked --release --target-dir release

test:
	cd wtmm && cargo test
	cd wtmm && cargo fmt --check
	cd ansible && ansible-playbook --inventory hosts --syntax-check deploy.yml provision.yml

ansible-deploy:
	cd ansible && ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=dev" deploy.yml

ansible-deploy-prod:
	cd ansible && ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts --extra-vars "env=prod" deploy.yml

ansible-provision:
	cd ansible && ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook --inventory hosts provision.yml
