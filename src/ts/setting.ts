import "../assets/scss/setting.scss";
import pugTpl from "../pug/setting.pug";
import {ipfs} from "./utils/initIPFS";
import {loaded} from "./utils/initPage";
import {publishUser} from "./utils/publishUser";
import {renderPug} from "./utils/renderPug";
import {config} from "./config/config";

const init = async () => {
    renderPug(pugTpl);

    let oldUserJSON: IUser;
    const identity = await ipfs.id();

    try {
        const oldUserStr = await ipfs.files.read(`/starfire/users/${identity.id}`);
        oldUserJSON = JSON.parse(oldUserStr.toString());
    } catch (e) {
        console.warn(e);
    }

    // render html
    const avatarPathElement = document.getElementById("avatarPath") as HTMLInputElement
    const avatarImgElement = document.getElementById("avatarImg")
    avatarImgElement.setAttribute('src', (oldUserJSON && oldUserJSON.avatar) || config.defaultAvatar);
    avatarPathElement.value = (oldUserJSON && oldUserJSON.avatar) || config.defaultAvatar;
    (document.getElementById("name") as HTMLInputElement).value = (oldUserJSON && oldUserJSON.name) || "";
    (document.getElementById("id") as HTMLInputElement).value = identity.id;

    avatarPathElement.addEventListener('change', () => {
        avatarImgElement.setAttribute('src', avatarPathElement.value);
    })

    // bind start
    document.getElementById("start").addEventListener("click", async () => {
        localStorage.userId = identity.id;
        localStorage.publicKey = identity.publicKey;

        const userObj = {
            avatar: (document.getElementById("avatarImg") as HTMLInputElement).value,
            id: identity.id,
            latestCommentId: (oldUserJSON && oldUserJSON.latestCommentId) || "",
            latestPostId: (oldUserJSON && oldUserJSON.latestPostId) || "",
            name: (document.getElementById("name") as HTMLInputElement).value,
            publicKey: identity.publicKey,
        };

        await publishUser(userObj, ipfs);
        window.location.href = config.indexPath;
    });

    loaded(ipfs);
};

init();
