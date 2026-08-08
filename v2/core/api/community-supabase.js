import { supabase } from "../supabase/client.js";
import { auth } from "../firebase/app.js";

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  return user;
}

export async function ensureProfile(user = requireUser()) {
  const { data, error } = await supabase.from("profiles").upsert({
    id: user.uid,
    username: user.displayName || user.email?.split("@")[0] || "User",
    avatar_url: user.photoURL || null,
    updated_at: new Date().toISOString()
  }, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}

export async function listPosts() {
  const { data, error } = await supabase.from("posts").select("*, profiles(username, avatar_url)").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPost(id) {
  const { data, error } = await supabase.from("posts").select("*, profiles(username, avatar_url)").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createPost(title, content) {
  const user = requireUser(); await ensureProfile(user);
  const { data, error } = await supabase.from("posts").insert({ author_id: user.uid, title: title.trim(), content: content.trim() }).select().single();
  if (error) throw error; return data;
}

export async function updatePost(id, title, content) {
  const { data, error } = await supabase.from("posts").update({ title: title.trim(), content: content.trim(), updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error; return data;
}

export async function deletePost(id) {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

export async function listComments(postId) {
  const { data, error } = await supabase.from("comments").select("*, profiles(username, avatar_url)").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error; return data;
}

export function subscribeComments(postId, callback) {
  return supabase.channel(`comments:${postId}`).on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, callback).subscribe();
}

export async function createComment(postId, content) {
  const user = requireUser(); await ensureProfile(user);
  const { data, error } = await supabase.from("comments").insert({ post_id: postId, author_id: user.uid, content: content.trim() }).select().single();
  if (error) throw error; return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}

async function toggleReaction(table, key, id, type) {
  const user = requireUser();
  const filter = { [key]: id, user_id: user.uid };
  const { data: current, error: readError } = await supabase.from(table).select("reaction").match(filter).maybeSingle();
  if (readError) throw readError;
  if (current?.reaction === type) {
    const { error } = await supabase.from(table).delete().match(filter); if (error) throw error; return null;
  }
  const { error } = await supabase.from(table).upsert({ ...filter, reaction: type }, { onConflict: `${key},user_id` });
  if (error) throw error; return type;
}

export const togglePostReaction = (id, type) => toggleReaction("post_reactions", "post_id", id, type);
export const toggleCommentReaction = (id, type) => toggleReaction("comment_reactions", "comment_id", id, type);

export async function reportPost(postId, reason) {
  const user = requireUser();
  const { error } = await supabase.from("reports").insert({ reporter_id: user.uid, post_id: postId, reason: reason.trim().slice(0, 500) });
  if (error) throw error;
}

export async function reportComment(commentId, reason) {
  const user = requireUser();
  const { error } = await supabase.from("reports").insert({ reporter_id: user.uid, comment_id: commentId, reason: reason.trim().slice(0, 500) });
  if (error) throw error;
}
