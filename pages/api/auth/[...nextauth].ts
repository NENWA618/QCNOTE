import NextAuth from "next-auth";
import { authOptions } from "./authConfig";

export default NextAuth(authOptions);

