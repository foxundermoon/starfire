import ipfsClient from "ipfs-http-client";
import "../assets/scss/index.scss";

const ipfs = ipfsClient("localhost", "5001", {protocol: "http"});

const init = async () => {
    const selectElement = document.getElementById("list") as HTMLSelectElement;

    ipfs.key.list((err: Error, keys: any []) => {
        let optionsHTML = "";
        keys.forEach((item) => {
            optionsHTML += `<option value="${item.id}">${item.name}</option>`;
        });
        selectElement.innerHTML = optionsHTML;
    });

    document.getElementById("add").addEventListener("click", () => {
        ipfs.key.gen((document.getElementById("name") as HTMLInputElement).value, {
            size: 2048,
            type: "rsa",
        }, () => {
            window.location.reload();
        });
    });

    document.getElementById("remove").addEventListener("click", () => {
        ipfs.key.rm(selectElement.options[selectElement.selectedIndex].text, () => {
            window.location.reload();
        });
    });

    document.getElementById("init").addEventListener("click", async () => {
        const id = selectElement.value;

        const path = `/starfire/users/${id}`;

        try {
            await ipfs.files.rm(path);
        } catch (e) {
            console.warn(e);
        }

        const user = {
            id,
            latestCommentId: "",
            latestPostId: "",
            name: selectElement.options[selectElement.selectedIndex].text,
        };
        localStorage.userId = id;
        ipfs.files.write(path, Buffer.from(JSON.stringify(user)), {
            create: true,
            parents: true,
        }, () => {
            window.location.href = "/";
        });
    });
};

init();
