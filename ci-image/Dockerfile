FROM rust:bullseye

RUN apt-get --yes update
RUN apt-get --yes install \
    sudo \
    python3 \
    python3-pip \
    git

RUN pip3 install ansible

RUN rustup component add rustfmt

WORKDIR /home/cicd

CMD ["python3", "--version"]