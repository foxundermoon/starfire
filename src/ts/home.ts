import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isIPFS from "is-ipfs";
import {escapeHtml} from "xss";
import pugTpl from "../pug/home.pug";
import {config} from "./config/config";
import {getAvatarPath} from "./utils/getAvatarPath";
import {getIPFSGateway} from "./utils/getIPFSGateway";
import {getTitleLink} from "./utils/getUserHTML";
import {ipfs} from "./utils/initIPFS";
import {loaded} from "./utils/initPage";
import {isNodeIdPost} from "./utils/isNodeIdPost";
import {mdParse, mdRender} from "./utils/mdRender";
import {showMsg} from "./utils/msg";
import {renderPug} from "./utils/renderPug";
import {verify} from "./utils/sign";
import {sortObject} from "./utils/tools/sortObject";

dayjs.extend(relativeTime);

const userId = location.search.split("=")[1] || localStorage.userId;

const syncOtherUser = (cb?: (() => void)) => {
    if (userId !== localStorage.userId) {
        document.getElementById("loading").style.display = "block";
        ipfs.name.resolve(`/ipns/${userId}`, {recursive: true}, (nameErr: Error, name: string) => {
            document.getElementById("loading").style.display = "none";
            if (!name) {
                render(JSON.parse('{"signature":1}'));
                return;
            }
            ipfs.get(name, (err: Error, files: IPFSFile []) => {
                if (err) {
                    render(JSON.parse('{"signature":1}'));
                    return;
                }
                if (!files) {
                    render(JSON.parse('{"signature":1}'));
                    return;
                }
                files.forEach(async (file) => {
                    if (!file.content) {
                        render(JSON.parse('{"signature":1}'));
                        return;
                    }
                    ipfs.files.write(`/starfire/users/${userId}`, Buffer.from(file.content.toString()), {
                        create: true,
                        parents: true,
                        truncate: true,
                    });
                    if (cb) {
                        cb();
                    }
                    render(JSON.parse(file.content.toString()));
                });
            });
        });
    }
};

const init = async () => {
    renderPug(pugTpl);

    const syncBtnElement = document.getElementById("syncBtn");

    if (location.search.split("=")[1] && location.search.split("=")[1] !== localStorage.userId) {
        document.querySelector(".header__item--current").className = "header__item right";
        syncBtnElement.innerHTML = "Pull";
    } else {
        syncBtnElement.innerHTML = "Push";
    }

    const postBtn = document.getElementById("postBtn");
    const commentBtn = document.getElementById("commentBtn");
    const postList = document.getElementById("postList");
    const commentList = document.getElementById("commentList");
    postBtn.addEventListener("click", () => {
        postBtn.className = "current";
        commentBtn.className = "";
        postList.style.display = "block";
        commentList.style.display = "none";
    });
    commentBtn.addEventListener("click", () => {
        postBtn.className = "";
        commentBtn.className = "current";
        postList.style.display = "none";
        commentList.style.display = "block";
    });

    let userStr = "{}";
    try {
        userStr = await ipfs.files.read(`/starfire/users/${userId}`);
    } catch (e) {
        syncOtherUser();
    }

    render(JSON.parse(userStr.toString()));
    loaded(ipfs);

    document.getElementById("syncBtn").addEventListener("click", async () => {
        const loadingElement = document.getElementById("loading");
        if (loadingElement.style.display === "block") {
            return;
        }
        loadingElement.style.display = "block";
        if (userId === localStorage.userId) {
            const stats = await ipfs.files.stat(`/starfire/users/${localStorage.userId}`);
            ipfs.name.publish(`/ipfs/${stats.hash}`, () => {
                loadingElement.style.display = "none";
                showMsg("发布成功");
            });
        } else {
            syncOtherUser(() => {
                showMsg("更新成功");
            });
        }
    });
};

const render = async (userJSON: IUser) => {
    const signature = userJSON.signature;

    if (!signature) {
        return;
    }

    const gateway = await getIPFSGateway(ipfs);
    // ipns 失败
    if (parseInt(signature, 10) === 1) {
        document.getElementById("user").innerHTML = `
<img class="avatar--big avatar" src="${gateway}/ipfs/${config.defaultAvatar}">
<div class="flex1 meta">
    <div class="username">This node is offline</div>
    <div class="gray">This node is offline</div>
</div>`;
        return;
    }

    const isMatchNodeId = await isNodeIdPost(userJSON.publicKey, userJSON.id);
    if (!isMatchNodeId) {
        showMsg("用户身份校验失败");
        return;
    }

    delete userJSON.signature;
    const isMatch = await verify(JSON.stringify(sortObject(userJSON)), userJSON.publicKey, signature);
    if (!isMatch) {
        showMsg("数据异常");
        return;
    }

    const postList = document.getElementById("postList");
    const commentList = document.getElementById("commentList");

    const latestPostId = userJSON.latestPostId;
    const latestCommentId = userJSON.latestCommentId;

    document.getElementById("user").innerHTML = `
<img class="avatar--big avatar" src="${getAvatarPath(userJSON.avatar, gateway)}">
<div class="flex1 meta">
    <div class="username">${escapeHtml(userJSON.name || "No Name")}</div>
    <div class="gray">${escapeHtml(userJSON.id)}</div>
</div>`;

    if (latestPostId) {
        postList.innerHTML = "";
        traverseIds(latestPostId, (id: string, post: IPost) => {
            postList.insertAdjacentHTML("beforeend", `
<li class="post__item">
    <img class="avatar avatar--small" src="${getAvatarPath(post.userAvatar, gateway)}"/>
    <div class="flex1">
        <span class="link">
            ${escapeHtml(post.userName || "No Name")}
        </span>
        <time class="gray">
            ${dayjs().to(dayjs(post.time))}
        </time>
        ${getTitleLink(id, post.title || "No Title")}
    </div>
</li>`);
        });
    }

    if (latestCommentId) {
        commentList.innerHTML = "";
        traverseIds(latestCommentId, async (id: string, comment: IComment) => {
            const contentHTML = await mdParse(comment.content);
            let titleHTML = escapeHtml(comment.postId);
            if (isIPFS.cid(comment.postId) && isIPFS.cid(id) && isIPFS.cid(comment.postId)) {
                titleHTML =
                    `<a href="${config.detailPath}?id=${comment.postId}#${id}" class="link">${comment.postId}</a>`;
            }
            commentList.insertAdjacentHTML("beforeend", `
<li class="comment__item">
    <img class="avatar" src="${getAvatarPath(comment.userAvatar, gateway)}"/>
    <div class="module flex1">
        <div class="module__header">
            ${titleHTML}
            <time class="gray">${dayjs().to(dayjs(comment.time))}</time>
        </div>
        <div class="module__body vditor-reset">${contentHTML || "No Content"}</div>
    </div>
</li>`);
        });
    }
};

const traverseIds = async (id: string, renderCB: ((id: string, post: IPost | IComment) => void)) => {
    while (id) {
        const current = await ipfs.dag.get(id);

        const isMatchNodeId = await isNodeIdPost(current.value.publicKey, current.value.userId);
        const signature = current.value.signature;
        delete current.value.signature;
        const isMatch = await verify(JSON.stringify(sortObject(current.value)), current.value.publicKey, signature);

        if (isMatch && isMatchNodeId) {
            await renderCB(id, current.value);
        }

        const previousId = current.value.previousId;
        if (previousId) {
            id = previousId;
        } else {
            mdRender(document.getElementById("commentList"));
            return;
        }
    }
};

init();
