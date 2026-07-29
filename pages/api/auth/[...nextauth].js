import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        // Exemplo de login funcional. Para escalar, integre com Prisma/Supabase/Firebase.
        if (credentials.email === "admin@admin.com" && credentials.password === "admin") {
          return { id: 1, name: "Usuário Admin", email: "admin@admin.com" };
        }
        return null;
      }
    })
  ],
  secret: "chave-secreta-ambiente-dev",
  session: { strategy: 'jwt' }
});
