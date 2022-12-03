<h1 align="center">Architecture</h1>

This project is deployed as a single binary that listens on port for:

1. Postmark webhook requests: Any emails sent to @whotookmy.money are sent to
   forwarded to the binary via a postmark webhook. 

2. Browser requests for a user's dashboard: The dashboard is protected such that
   only the binary can give you a valid URL to use. This happens when you sign
   up for whootookmy.money.

Ansible is used to do the actual deployment (and provisioning work). Right now,
the binary is deployed to a single Digital Ocean VM.
The deployment processes creates a SystemD service file that executes the binary
and restarts it if it fails. The service file is checked-in to the repo.

All data is stored in a Sqlite3 file, both during development and in production.
In production, the file is created adjacent  to the deployed binary.

A SystemD timer runs daily to back up the Sqlite3 database to an AWS S3 bucket.
This timer file is also checked-in to the repo.

# Deployment, SSH and Keys

Ansible allows me to easily automate setting up and running arbitrary scripts on
remote machines. It uses SSH to do so.

The recommended way to use SSH is using Public/Private keys. The user holds the
private key, and the machine that they'd like to connect to should have a copy
of the public key.

In this project, ansible is used for two distinct tasks:

- Provision new machines: Install all the necessary software needed for our code
  to run, setup the deploy user account, setup nginx, dns etc...
- Deploy new builds: The whotookmy.money binary is deployed to production
  machines after every successful PR/main build  
 
## Provisioning new machines 

### SSH
When creating the machine for the first time, add the deployment SSH public key to
the root account so that the CI machines can connect to it duriung the
provisining step.
As part of that provisioning, that same public key is copied to the deploy-user
account as well. This allows us to SSH into a non-root account when deploying new builds.

Note: You probably will have some other personal SSH key pair saved as `id_rsa`.
To SSH to the production machine with the deployment key pair, you'll need to
add it to the list of key pairs that the ssh agent knows about using `ssh-add`

### DNS & SSL 

The other big part of provisining a new machine is making sure it is
reachable over DNS and is setup with valid SSL certificates so that browsers can
hit the necessary ports over https://.

We use namecheap DNS servers to create `A` records pointing our domains to the
current production machine.

We use the certbot cli to issue SSL certificates for our domain names. 

Note: The Postmark webhookos use these addresses. So when provisioning new
machines it will be expected that some messages will fail to deliver for a bit
while DNS figures itself out.

